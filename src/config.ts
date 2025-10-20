import { config as loadEnv } from 'dotenv';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import type { ServerConfig, CacheOptions } from './types/index.js';
import { logger } from './utils/logger.js';

loadEnv();

interface CliArgs {
  'apifox-api-key'?: string;
  'apifox-cookie-token'?: string;
  'project-id'?: string;
  port?: number;
  local?: boolean;
}

export function getServerConfig(): ServerConfig {
  const argv = yargs(hideBin(process.argv))
    .options({
      'apifox-api-key': {
        type: 'string',
        describe: 'Apifox API密钥',
      },
      'apifox-cookie-token': {
        type: 'string',
        describe: 'Apifox Cookie Token (用于调试)',
      },
      'project-id': {
        type: 'string',
        describe: 'Apifox项目ID',
      },
      port: {
        type: 'number',
        describe: 'HTTP服务器端口',
      },
      local: {
        type: 'boolean',
        describe: 'CLI模式（使用stdio传输）',
        default: false,
      },
    })
    .help()
    .parseSync() as CliArgs;

  const config: ServerConfig = {
    apifoxApiKey: undefined,
    apifoxCookieToken: undefined,
    projectId: undefined,
    port: 3000,
    logLevel: 'info',
  };

  if (argv['apifox-api-key']) {
    config.apifoxApiKey = argv['apifox-api-key'];
  } else if (process.env.APIFOX_API_KEY) {
    config.apifoxApiKey = process.env.APIFOX_API_KEY;
  }

  if (argv['apifox-cookie-token']) {
    config.apifoxCookieToken = argv['apifox-cookie-token'];
  } else if (process.env.APIFOX_COOKIE_TOKEN) {
    config.apifoxCookieToken = process.env.APIFOX_COOKIE_TOKEN;
  }

  if (argv['project-id']) {
    config.projectId = argv['project-id'];
  } else if (process.env.PROJECT_ID) {
    config.projectId = process.env.PROJECT_ID;
  }

  if (argv.port) {
    config.port = argv.port;
  } else if (process.env.PORT) {
    config.port = parseInt(process.env.PORT, 10);
  } else {
    config.port = 3000;
  }

  const logLevel = process.env.LOG_LEVEL as ServerConfig['logLevel'];
  if (logLevel && ['debug', 'info', 'warn', 'error'].includes(logLevel)) {
    config.logLevel = logLevel;
  }

  if (!config.apifoxApiKey && !config.apifoxCookieToken) {
    logger.error('❌ 缺少鉴权配置');
    console.error('请通过以下方式之一提供鉴权信息：');
    console.error('  1. API Key（推荐）:');
    console.error('     - 命令行: --apifox-api-key=xxx');
    console.error('     - 环境变量: APIFOX_API_KEY=xxx');
    console.error('  2. Cookie Token（用于调试）:');
    console.error('     - 命令行: --apifox-cookie-token=xxx');
    console.error('     - 环境变量: APIFOX_COOKIE_TOKEN=xxx');
    process.exit(1);
  }

  return config;
}

export function getCacheOptions(): CacheOptions {
  return {
    enabled: process.env.CACHE_ENABLED !== 'false', // 默认启用
    persistent: process.env.CACHE_PERSISTENT !== 'false', // 默认启用持久化
    ttl: process.env.CACHE_TTL
      ? parseInt(process.env.CACHE_TTL, 10)
      : 60 * 60 * 1000, // 默认 1 小时
    maxSize: process.env.CACHE_MAX_SIZE
      ? parseInt(process.env.CACHE_MAX_SIZE, 10)
      : 200, // 内存缓存 200 个
    persistentMaxSize: process.env.CACHE_PERSISTENT_MAX_SIZE
      ? parseInt(process.env.CACHE_PERSISTENT_MAX_SIZE, 10)
      : 500, // 磁盘缓存 500 个
    syncInterval: process.env.CACHE_SYNC_INTERVAL
      ? parseInt(process.env.CACHE_SYNC_INTERVAL, 10)
      : 30000, // 默认 30 秒同步一次
  };
}
