import Conf from 'conf';
import type {
  FoxyMcpConfig,
  CacheData,
  MockDataPoolData,
} from '../types/index.js';
import { logger } from '../utils/logger.js';

// 单例模式：全局唯一的配置实例
let confInstance: Conf<FoxyMcpConfig> | null = null;

export function getStorageInstance(): Conf<FoxyMcpConfig> {
  if (!confInstance) {
    confInstance = new Conf<FoxyMcpConfig>({
      projectName: 'foxy-mcp',
      defaults: {
        cache: {
          apis: {},
          urlIndex: {},
          nameIndex: {},
          pathIndex: {},
        },
        mockDataPool: {
          global: {},
          projects: {},
        },
      },
      schema: {
        cache: {
          type: 'object',
          properties: {
            apis: { type: 'object' },
            urlIndex: { type: 'object' },
            nameIndex: { type: 'object' },
            pathIndex: { type: 'object' },
          },
        },
        mockDataPool: {
          type: 'object',
          properties: {
            global: { type: 'object' },
            projects: { type: 'object' },
          },
        },
      },
    });

    logger.debug('Storage service initialized', {
      projectName: 'foxy-mcp',
      storePath: confInstance.path,
    });
  }
  return confInstance;
}

/**
 * 获取缓存数据
 */
export function getCacheData(): CacheData {
  const storage = getStorageInstance();
  return storage.get('cache');
}

/**
 * 设置缓存数据
 */
export function setCacheData(data: CacheData): void {
  const storage = getStorageInstance();
  storage.set('cache', data);
}

/**
 * 获取 Mock 数据池
 */
export function getMockDataPool(): MockDataPoolData {
  const storage = getStorageInstance();
  return storage.get('mockDataPool');
}

/**
 * 设置 Mock 数据池
 */
export function setMockDataPool(data: MockDataPoolData): void {
  const storage = getStorageInstance();
  storage.set('mockDataPool', data);
}

/**
 * 清空缓存（不影响数据池）
 */
export function clearCache(projectId?: string): number {
  const storage = getStorageInstance();
  const cache = storage.get('cache');
  let count = 0;

  if (projectId) {
    // 清理特定项目的缓存
    for (const key of Object.keys(cache.apis)) {
      if (key.startsWith(`api:${projectId}:`)) {
        delete cache.apis[key];
        count++;
      }
    }

    // 清理索引
    cache.urlIndex = {};
    cache.nameIndex = {};
    cache.pathIndex = {};

    storage.set('cache', cache);
    logger.info('Project cache cleared', { projectId, count });
  } else {
    // 清空所有缓存
    count = Object.keys(cache.apis).length;
    storage.set('cache', {
      apis: {},
      urlIndex: {},
      nameIndex: {},
      pathIndex: {},
    });
    logger.info('All cache cleared', { count });
  }

  return count;
}

/**
 * 清空数据池（不影响缓存）
 */
export function clearDataPool(
  scope: 'global' | 'project' | 'all',
  projectId?: string
): { cleared: number; message: string } {
  const storage = getStorageInstance();
  const pool = storage.get('mockDataPool');

  let cleared = 0;
  let message = '';

  switch (scope) {
    case 'global':
      cleared = Object.keys(pool.global).length;
      pool.global = {};
      message = `已清空全局数据池（${cleared}个字段）`;
      break;

    case 'project':
      if (!projectId) {
        throw new Error('清空项目数据池时必须提供 projectId');
      }
      cleared = Object.keys(pool.projects[projectId] || {}).length;
      delete pool.projects[projectId];
      message = `已清空项目${projectId}的数据池（${cleared}个字段）`;
      break;

    case 'all':
      const globalCount = Object.keys(pool.global).length;
      const projectCount = Object.keys(pool.projects).length;
      pool.global = {};
      pool.projects = {};
      cleared = globalCount + projectCount;
      message = `已清空所有数据池（全局${globalCount}个字段，${projectCount}个项目）`;
      break;
  }

  storage.set('mockDataPool', pool);
  logger.warn('Data pool cleared', { scope, projectId, cleared });

  return { cleared, message };
}

/**
 * 清空所有数据
 */
export function clearAllData(): { cacheCount: number; poolCount: number } {
  const storage = getStorageInstance();

  const cacheCount = Object.keys(storage.get('cache').apis).length;
  const poolGlobalCount = Object.keys(
    storage.get('mockDataPool').global
  ).length;
  const poolProjectCount = Object.keys(
    storage.get('mockDataPool').projects
  ).length;

  // 重置为默认值
  storage.clear();

  logger.warn('All data cleared', {
    cacheCount,
    poolGlobalCount,
    poolProjectCount,
  });

  return {
    cacheCount,
    poolCount: poolGlobalCount + poolProjectCount,
  };
}

/**
 * 获取数据统计
 */
export function getDataStats(): {
  cache: { apis: number; indexes: number };
  dataPool: { global: number; projects: number; projectList: string[] };
} {
  const storage = getStorageInstance();

  const cache = storage.get('cache');
  const pool = storage.get('mockDataPool');

  const projectList = Object.keys(pool.projects);
  const projectFieldCount = projectList.reduce(
    (sum, projectId) => sum + Object.keys(pool.projects[projectId]).length,
    0
  );

  return {
    cache: {
      apis: Object.keys(cache.apis).length,
      indexes: Object.keys(cache.urlIndex).length,
    },
    dataPool: {
      global: Object.keys(pool.global).length,
      projects: projectFieldCount,
      projectList,
    },
  };
}
