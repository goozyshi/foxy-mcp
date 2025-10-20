// 🦊 Foxy MCP - Type Definitions

export interface ServerConfig {
  apifoxApiKey?: string;
  apifoxCookieToken?: string;
  projectId?: string;
  port: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

// 导出范围类型
export type ExportScope =
  | { type: 'ALL'; excludedByTags?: string[] }
  | {
      type: 'SELECTED_ENDPOINTS';
      selectedEndpointIds: number[];
      excludedByTags?: string[];
    }
  | {
      type: 'SELECTED_TAGS';
      selectedTags: string[];
      excludedByTags?: string[];
    }
  | {
      type: 'SELECTED_FOLDERS';
      selectedFolderIds: number[];
      excludedByTags?: string[];
    };

export interface ApifoxExportOptions {
  scope: ExportScope;
  options?: {
    includeApifoxExtensionProperties?: boolean;
    addFoldersToTags?: boolean;
  };
  oasVersion?: '2.0' | '3.0' | '3.1';
  exportFormat?: 'JSON' | 'YAML';
}

export interface OpenApiDocument {
  openapi: string;
  info: {
    title: string;
    version: string;
  };
  paths: Record<string, any>;
  components?: Record<string, any>;
}

// Apifox URL 解析结果
export interface ApifoxUrlInfo {
  projectId: string;
  apiId: number;
  isValid: boolean;
}

// ========== 缓存相关类型 ==========

// 缓存的 API 元数据
export interface CachedApiMetadata {
  apiId: number;
  projectId: string;
  name: string;
  path: string;
  method: string;
  url?: string;
  cachedAt: number;
}

// 缓存条目
export interface CachedApiEntry {
  document: OpenApiDocument;
  metadata: CachedApiMetadata;
}

// API 索引条目
export interface ApiIndexEntry {
  projectId: string;
  apiId: number;
}

// 缓存配置
export interface CacheOptions {
  enabled?: boolean;
  ttl?: number; // 过期时间（毫秒）
  maxSize?: number; // 最大缓存数量（内存）
  persistent?: boolean; // 是否启用磁盘持久化
  persistentMaxSize?: number; // 磁盘最大缓存数量
  syncInterval?: number; // 同步到磁盘的间隔（毫秒）
}

// 缓存统计
export interface CacheStats {
  memory: {
    size: number;
    max: number;
    hits: number;
    misses: number;
  };
  persistent?: {
    size: number;
    max: number;
    hits: number;
  };
  indexes: {
    url: number;
    name: number;
    path: number;
  };
}

// ========== 统一配置类型 ==========

// 缓存数据结构
export interface CacheData {
  apis: Record<string, CachedApiEntry>;
  urlIndex: Record<string, ApiIndexEntry>;
  nameIndex: Record<string, ApiIndexEntry>;
  pathIndex: Record<string, ApiIndexEntry>;
}

// Mock 数据池结构
export interface MockDataPoolData {
  global: Record<string, any[]>; // 全局池
  projects: Record<string, Record<string, any[]>>; // 项目池
}

// Foxy MCP 统一配置
export interface FoxyMcpConfig {
  cache: CacheData;
  mockDataPool: MockDataPoolData;
}
