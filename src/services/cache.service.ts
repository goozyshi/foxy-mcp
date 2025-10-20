import { LRUCache } from 'lru-cache';
import crypto from 'crypto';
import type {
  CachedApiEntry,
  ApiIndexEntry,
  CacheOptions,
  CacheStats,
  FoxyMcpConfig,
} from '../types/index.js';
import { logger } from '../utils/logger.js';
import { getStorageInstance } from './storage.service.js';
import type Conf from 'conf';

export class CacheService {
  private enabled: boolean;
  private persistentEnabled: boolean;
  private ttl: number;
  private syncInterval: number;

  private memoryCache: LRUCache<string, CachedApiEntry>;
  private urlIndex: LRUCache<string, ApiIndexEntry>;
  private nameIndex: LRUCache<string, ApiIndexEntry>;
  private pathIndex: LRUCache<string, ApiIndexEntry>;

  private persistentStore: Conf<FoxyMcpConfig> | null = null;
  private syncTimer: NodeJS.Timeout | null = null;
  private dirtyKeys = new Set<string>();

  private stats = {
    memory: {
      hits: 0,
      misses: 0,
    },
    persistent: {
      hits: 0,
      misses: 0,
    },
  };

  constructor(options: CacheOptions = {}) {
    this.enabled = options.enabled !== false;
    this.persistentEnabled = options.persistent !== false;
    this.ttl = options.ttl || 60 * 60 * 1000;
    this.syncInterval = options.syncInterval || 30000;

    const memoryMaxSize = options.maxSize || 200;
    const persistentMaxSize = options.persistentMaxSize || 500;

    // 初始化内存缓存
    this.memoryCache = new LRUCache({
      max: memoryMaxSize,
      ttl: this.ttl,
      updateAgeOnGet: true,
      updateAgeOnHas: false,
    });

    this.urlIndex = new LRUCache({
      max: memoryMaxSize * 2,
      ttl: this.ttl,
      updateAgeOnGet: true,
    });

    this.nameIndex = new LRUCache({
      max: memoryMaxSize * 2,
      ttl: this.ttl,
      updateAgeOnGet: true,
    });

    this.pathIndex = new LRUCache({
      max: memoryMaxSize * 2,
      ttl: this.ttl,
      updateAgeOnGet: true,
    });

    // 初始化磁盘存储（使用统一存储服务）
    if (this.persistentEnabled) {
      try {
        this.persistentStore = getStorageInstance();

        // 冷启动：从磁盘加载缓存
        this.loadFromDisk();

        // 启动定期同步
        this.startSyncTimer();

        logger.debug('Persistent cache initialized', {
          storePath: this.persistentStore.path,
          maxSize: persistentMaxSize,
        });
      } catch (error: any) {
        logger.warn(
          'Failed to initialize persistent cache, fallback to memory-only',
          {
            error: error.message,
          }
        );
        this.persistentEnabled = false;
        this.persistentStore = null;
      }
    }

    logger.debug('Cache service initialized', {
      enabled: this.enabled,
      persistent: this.persistentEnabled,
      ttl: `${this.ttl / 1000}s`,
      memoryMaxSize,
      persistentMaxSize,
    });
  }

  // ========== 存储接口 ==========

  setApi(entry: CachedApiEntry): void {
    if (!this.enabled) return;

    const { projectId, apiId, name, path, method, url } = entry.metadata;

    // 1. 存储主数据到内存
    const mainKey = this.getApiKey(projectId, apiId);
    this.memoryCache.set(mainKey, entry);
    this.dirtyKeys.add(mainKey);

    // 2. 建立 URL 索引
    if (url) {
      const urlKey = this.getUrlKey(url);
      this.urlIndex.set(urlKey, { projectId, apiId });
    }

    // 3. 建立接口名索引
    const nameKey = this.getNameKey(projectId, name);
    this.nameIndex.set(nameKey, { projectId, apiId });

    // 4. 建立路径索引
    const pathKey = this.getPathKey(projectId, method, path);
    this.pathIndex.set(pathKey, { projectId, apiId });

    // 5. 异步写入磁盘（非阻塞）
    if (this.persistentEnabled && this.persistentStore) {
      setImmediate(() => this.syncToDisk(mainKey, entry));
    }

    logger.debug('Cache set', {
      apiId,
      name: name.substring(0, 30) + (name.length > 30 ? '...' : ''),
      persistent: this.persistentEnabled,
    });
  }

  // ========== 查找接口 ==========

  findByUrl(
    url: string
  ): { entry: CachedApiEntry; source: 'memory' | 'disk' } | undefined {
    if (!this.enabled) return undefined;

    const urlKey = this.getUrlKey(url);

    // 1. 先查内存索引
    let index = this.urlIndex.get(urlKey);

    if (!index && this.persistentEnabled && this.persistentStore) {
      // 2. 再查磁盘索引
      const diskIndexes = this.persistentStore.get('cache').urlIndex;
      index = diskIndexes[urlKey];

      if (index) {
        this.stats.persistent.hits++;
        // 回填内存索引
        this.urlIndex.set(urlKey, index);
      }
    }

    if (!index) {
      this.stats.memory.misses++;
      logger.debug('Cache miss: URL', {
        url: url.substring(0, 60) + '...',
      });
      return undefined;
    }

    // 获取主数据
    const result = this.getApiInternal(index.projectId, index.apiId, 'URL');
    return result
      ? { entry: result.entry, source: result.cacheSource }
      : undefined;
  }

  findByName(
    projectId: string,
    name: string
  ): { entry: CachedApiEntry; source: 'memory' | 'disk' } | undefined {
    if (!this.enabled) return undefined;

    // 1. 精确匹配
    const exactKey = this.getNameKey(projectId, name);
    let index = this.nameIndex.get(exactKey);

    if (!index && this.persistentEnabled && this.persistentStore) {
      const diskIndexes = this.persistentStore.get('cache').nameIndex;
      index = diskIndexes[exactKey];

      if (index) {
        this.stats.persistent.hits++;
        this.nameIndex.set(exactKey, index);
      }
    }

    if (index) {
      const result = this.getApiInternal(
        projectId,
        index.apiId,
        'Name - Exact'
      );
      if (result) return { entry: result.entry, source: result.cacheSource };
    }

    // 2. 模糊匹配（仅内存）
    const fuzzyResult = this.fuzzySearchByName(projectId, name);
    if (fuzzyResult) {
      this.stats.memory.hits++;
      logger.info('✅ Cache HIT (Name - Fuzzy)', {
        keyword: name,
        matched: fuzzyResult.metadata.name,
      });
      return { entry: fuzzyResult, source: 'memory' };
    }

    this.stats.memory.misses++;
    logger.debug('Cache miss: Name', { projectId, name });
    return undefined;
  }

  findByPath(
    projectId: string,
    method: string,
    path: string
  ): { entry: CachedApiEntry; source: 'memory' | 'disk' } | undefined {
    if (!this.enabled) return undefined;

    const pathKey = this.getPathKey(projectId, method, path);

    // 1. 先查内存
    let index = this.pathIndex.get(pathKey);

    if (!index && this.persistentEnabled && this.persistentStore) {
      // 2. 再查磁盘
      const diskIndexes = this.persistentStore.get('cache').pathIndex;
      index = diskIndexes[pathKey];

      if (index) {
        this.stats.persistent.hits++;
        this.pathIndex.set(pathKey, index);
      }
    }

    if (!index) {
      this.stats.memory.misses++;
      logger.debug('Cache miss: Path', { projectId, method, path });
      return undefined;
    }

    const result = this.getApiInternal(projectId, index.apiId, 'Path');
    return result
      ? { entry: result.entry, source: result.cacheSource }
      : undefined;
  }

  getApi(
    projectId: string,
    apiId: number
  ): { entry: CachedApiEntry; source: 'memory' | 'disk' } | undefined {
    if (!this.enabled) return undefined;
    const result = this.getApiInternal(projectId, apiId, 'Direct');
    return result
      ? { entry: result.entry, source: result.cacheSource }
      : undefined;
  }

  // ========== 内部查找逻辑 ==========

  private getApiInternal(
    projectId: string,
    apiId: number,
    source: string
  ): { entry: CachedApiEntry; cacheSource: 'memory' | 'disk' } | undefined {
    const key = this.getApiKey(projectId, apiId);

    // 1. 先查内存
    let entry = this.memoryCache.get(key);
    if (entry && !this.isExpired(entry)) {
      this.stats.memory.hits++;
      logger.info(`✅ Cache HIT (${source} - Memory)`, {
        name: entry.metadata.name,
        apiId,
      });
      return { entry, cacheSource: 'memory' };
    }

    // 2. 再查磁盘
    if (this.persistentEnabled && this.persistentStore) {
      const diskApis = this.persistentStore.get('cache').apis;
      entry = diskApis[key];

      if (entry && !this.isExpired(entry)) {
        this.stats.persistent.hits++;
        logger.info(`✅ Cache HIT (${source} - Disk)`, {
          name: entry.metadata.name,
          apiId,
        });

        // 回填内存缓存
        this.memoryCache.set(key, entry);
        return { entry, cacheSource: 'disk' };
      }

      // 过期数据：从磁盘删除
      if (entry && this.isExpired(entry)) {
        this.removeFromDisk(key);
      }
    }

    this.stats.memory.misses++;
    return undefined;
  }

  // ========== 磁盘同步 ==========

  private syncToDisk(key: string, entry: CachedApiEntry): void {
    if (!this.persistentStore) return;

    try {
      const cache = this.persistentStore.get('cache');
      cache.apis[key] = entry;
      this.persistentStore.set('cache', cache);

      // 同步索引
      this.syncIndexesToDisk(entry);

      this.dirtyKeys.delete(key);
    } catch (error: any) {
      logger.error('Failed to sync to disk', {
        key,
        error: error.message,
      });
    }
  }

  private syncIndexesToDisk(entry: CachedApiEntry): void {
    if (!this.persistentStore) return;

    const { projectId, apiId, name, path, method, url } = entry.metadata;

    try {
      const cache = this.persistentStore.get('cache');

      // URL 索引
      if (url) {
        const urlKey = this.getUrlKey(url);
        cache.urlIndex[urlKey] = { projectId, apiId };
      }

      // 接口名索引
      const nameKey = this.getNameKey(projectId, name);
      cache.nameIndex[nameKey] = { projectId, apiId };

      // 路径索引
      const pathKey = this.getPathKey(projectId, method, path);
      cache.pathIndex[pathKey] = { projectId, apiId };

      this.persistentStore.set('cache', cache);
    } catch (error: any) {
      logger.debug('Failed to sync indexes', { error: error.message });
    }
  }

  private loadFromDisk(): void {
    if (!this.persistentStore) return;

    try {
      const cache = this.persistentStore.get('cache');
      const diskApis = cache.apis;
      let loadedCount = 0;
      let expiredCount = 0;

      for (const [key, entry] of Object.entries(diskApis)) {
        if (this.isExpired(entry)) {
          expiredCount++;
          continue;
        }

        // 加载到内存（但不占满内存）
        if (this.memoryCache.size < this.memoryCache.max / 2) {
          this.memoryCache.set(key, entry);
        }

        loadedCount++;
      }

      // 清理过期数据
      if (expiredCount > 0) {
        this.cleanupExpiredDiskCache();
      }

      logger.debug('Loaded cache from disk', {
        loaded: loadedCount,
        expired: expiredCount,
        diskTotal: Object.keys(diskApis).length,
      });
    } catch (error: any) {
      logger.error('Failed to load from disk', {
        error: error.message,
      });
    }
  }

  private startSyncTimer(): void {
    if (!this.persistentEnabled || this.syncTimer) return;

    this.syncTimer = setInterval(() => {
      if (this.dirtyKeys.size === 0) return;

      logger.debug('Syncing dirty keys to disk', {
        count: this.dirtyKeys.size,
      });

      // 批量同步脏数据
      for (const key of this.dirtyKeys) {
        const entry = this.memoryCache.get(key);
        if (entry) {
          this.syncToDisk(key, entry);
        }
      }
    }, this.syncInterval);
  }

  private stopSyncTimer(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  private removeFromDisk(key: string): void {
    if (!this.persistentStore) return;

    try {
      const cache = this.persistentStore.get('cache');
      delete cache.apis[key];
      this.persistentStore.set('cache', cache);
    } catch (error: any) {
      logger.debug('Failed to remove from disk', { key });
    }
  }

  private cleanupExpiredDiskCache(): void {
    if (!this.persistentStore) return;

    try {
      const cache = this.persistentStore.get('cache');
      const cleanedApis: Record<string, CachedApiEntry> = {};

      for (const [key, entry] of Object.entries(cache.apis)) {
        if (!this.isExpired(entry)) {
          cleanedApis[key] = entry;
        }
      }

      cache.apis = cleanedApis;
      this.persistentStore.set('cache', cache);

      logger.info('Cleaned expired disk cache', {
        before: Object.keys(cache.apis).length,
        after: Object.keys(cleanedApis).length,
      });
    } catch (error: any) {
      logger.error('Failed to cleanup disk cache', {
        error: error.message,
      });
    }
  }

  // ========== 辅助方法 ==========

  private isExpired(entry: CachedApiEntry): boolean {
    const age = Date.now() - entry.metadata.cachedAt;
    return age > this.ttl;
  }

  private fuzzySearchByName(
    projectId: string,
    keyword: string
  ): CachedApiEntry | undefined {
    const lowerKeyword = keyword.toLowerCase().trim();

    for (const [key, entry] of this.memoryCache.entries()) {
      if (!key.startsWith(`api:${projectId}:`)) continue;

      const lowerName = entry.metadata.name.toLowerCase();
      const lowerPath = entry.metadata.path.toLowerCase();

      if (
        lowerName.includes(lowerKeyword) ||
        lowerPath.includes(lowerKeyword)
      ) {
        return entry;
      }
    }

    return undefined;
  }

  // ========== 缓存键生成 ==========

  private getApiKey(projectId: string, apiId: number): string {
    return `api:${projectId}:${apiId}`;
  }

  private getUrlKey(url: string): string {
    const hash = crypto
      .createHash('md5')
      .update(url)
      .digest('hex')
      .substring(0, 16);
    return `url:${hash}`;
  }

  private getNameKey(projectId: string, name: string): string {
    const normalized = name.trim().toLowerCase();
    return `name:${projectId}:${normalized}`;
  }

  private getPathKey(projectId: string, method: string, path: string): string {
    return `path:${projectId}:${method.toUpperCase()}:${path}`;
  }

  // ========== 缓存管理 ==========

  clear(): void {
    // 清空内存
    this.memoryCache.clear();
    this.urlIndex.clear();
    this.nameIndex.clear();
    this.pathIndex.clear();

    // 清空磁盘（仅清空cache命名空间）
    if (this.persistentStore) {
      this.persistentStore.set('cache', {
        apis: {},
        urlIndex: {},
        nameIndex: {},
        pathIndex: {},
      });
    }

    this.stats.memory.hits = 0;
    this.stats.memory.misses = 0;
    this.stats.persistent.hits = 0;
    this.stats.persistent.misses = 0;

    logger.info('Cache cleared (memory + disk)');
  }

  clearProject(projectId: string): number {
    let count = 0;

    // 清理内存
    for (const key of this.memoryCache.keys()) {
      if (key.startsWith(`api:${projectId}:`)) {
        this.memoryCache.delete(key);
        count++;
      }
    }

    // 清理磁盘
    if (this.persistentStore) {
      const cache = this.persistentStore.get('cache');
      const cleanedApis: Record<string, CachedApiEntry> = {};

      for (const [key, entry] of Object.entries(cache.apis)) {
        if (entry.metadata.projectId !== projectId) {
          cleanedApis[key] = entry;
        }
      }

      cache.apis = cleanedApis;
      cache.urlIndex = {};
      cache.nameIndex = {};
      cache.pathIndex = {};
      this.persistentStore.set('cache', cache);
    }

    // 清理索引
    this.urlIndex.clear();
    this.nameIndex.clear();
    this.pathIndex.clear();

    logger.info('Project cache cleared', { projectId, count });
    return count;
  }

  /**
   * 按URL清除单个接口缓存
   * @param url - Apifox接口URL
   * @returns 是否成功清除
   */
  clearByUrl(url: string): boolean {
    if (!this.enabled) return false;

    const urlKey = this.getUrlKey(url);

    // 1. 从URL索引获取 projectId 和 apiId
    let index = this.urlIndex.get(urlKey);

    if (!index && this.persistentEnabled && this.persistentStore) {
      const diskIndexes = this.persistentStore.get('cache').urlIndex;
      index = diskIndexes[urlKey];
    }

    if (!index) {
      logger.debug('URL not found in cache', { url });
      return false;
    }

    const { projectId, apiId } = index;
    const mainKey = this.getApiKey(projectId, apiId);

    // 2. 清除内存缓存
    this.memoryCache.delete(mainKey);

    // 3. 清除磁盘缓存
    if (this.persistentStore) {
      const cache = this.persistentStore.get('cache');
      delete cache.apis[mainKey];
      delete cache.urlIndex[urlKey];
      this.persistentStore.set('cache', cache);
    }

    // 4. 清除内存索引
    this.urlIndex.delete(urlKey);

    // 清除其他索引（name, path）需要重建，为简化直接清空
    // 实际上这会影响其他缓存的索引，但不影响主缓存数据

    logger.info('Cache cleared by URL', {
      url: url.substring(0, 60) + '...',
      projectId,
      apiId,
    });

    return true;
  }

  getStats(): CacheStats {
    const stats: CacheStats = {
      memory: {
        size: this.memoryCache.size,
        max: this.memoryCache.max,
        hits: this.stats.memory.hits,
        misses: this.stats.memory.misses,
      },
      indexes: {
        url: this.urlIndex.size,
        name: this.nameIndex.size,
        path: this.pathIndex.size,
      },
    };

    if (this.persistentEnabled && this.persistentStore) {
      const diskApis = this.persistentStore.get('cache').apis;
      stats.persistent = {
        size: Object.keys(diskApis).length,
        max: 500,
        hits: this.stats.persistent.hits,
      };
    }

    return stats;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  isPersistentEnabled(): boolean {
    return this.persistentEnabled;
  }

  /**
   * 优雅关闭（刷新脏数据到磁盘）
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down cache service...');

    this.stopSyncTimer();

    // 刷新所有脏数据
    if (this.dirtyKeys.size > 0 && this.persistentStore) {
      logger.info('Flushing dirty cache to disk', {
        count: this.dirtyKeys.size,
      });

      for (const key of this.dirtyKeys) {
        const entry = this.memoryCache.get(key);
        if (entry) {
          this.syncToDisk(key, entry);
        }
      }
    }

    logger.info('✅ Cache service shutdown complete');
  }
}
