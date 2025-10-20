#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import chalk from 'chalk';
import { getServerConfig, getCacheOptions } from './config.js';
import { FoxyMcpServer } from './core/server.js';
import { HttpServer } from './core/http-server.js';
import { logger } from './utils/logger.js';
import { isPortInUse, getPortCleanupCommand } from './utils/port-checker.js';

let httpServerInstance: HttpServer | null = null;
let foxyServerInstance: FoxyMcpServer | null = null;

function setupGracefulShutdown(): void {
  const shutdown = async (signal: string) => {
    logger.info(`收到 ${signal} 信号，准备关闭服务器...`);

    try {
      if (httpServerInstance) {
        await httpServerInstance.stop();
      }

      if (foxyServerInstance) {
        await foxyServerInstance.shutdown();
      }

      process.exit(0);
    } catch (error: any) {
      logger.error('关闭失败', { error: error.message });
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

function setupErrorHandlers(): void {
  process.on('uncaughtException', (error: Error) => {
    logger.error('未捕获的异常', { error: error.message, stack: error.stack });
    if (process.env.NODE_ENV !== 'cli') {
      logger.warn('HTTP模式：尝试继续运行');
    } else {
      process.exit(1);
    }
  });

  process.on('unhandledRejection', (reason: any) => {
    logger.error('未处理的Promise拒绝', { reason });
  });
}

async function startServer(): Promise<void> {
  try {
    setupErrorHandlers();
    setupGracefulShutdown();

    const isCliMode =
      process.env.NODE_ENV === 'cli' || process.argv.includes('--local');
    const config = getServerConfig();
    const cacheOptions = getCacheOptions();

    if (!isCliMode) {
      console.log(chalk.cyan('\n🦊 Foxy MCP 启动中...\n'));

      if (config.apifoxApiKey) {
        const formatWarning = !config.apifoxApiKey.startsWith('APS-')
          ? chalk.yellow(' (格式异常)')
          : '';
        console.log(
          chalk.green('✅ 鉴权: API Key（开发者令牌）') + formatWarning
        );
      } else if (config.apifoxCookieToken) {
        const formatWarning =
          !config.apifoxCookieToken.trim().startsWith('Bearer ') &&
          !config.apifoxCookieToken.trim().startsWith('bearer ')
            ? chalk.yellow(' (格式异常)')
            : '';
        console.log(
          chalk.yellow('⚠️  鉴权: Cookie Token（会话过期风险）') + formatWarning
        );
      }

      if (config.projectId) {
        console.log(chalk.green(`✅ 项目: ${config.projectId}`));
      }

      console.log('');
    }

    const foxyServer = new FoxyMcpServer(
      {
        apiKey: config.apifoxApiKey,
        cookieToken: config.apifoxCookieToken,
      },
      config.projectId,
      cacheOptions
    );

    foxyServerInstance = foxyServer;

    if (isCliMode) {
      const transport = new StdioServerTransport();
      await foxyServer.getServer().connect(transport);
    } else {
      const cacheStats = foxyServer.getCacheStats();
      const storageService = await import('./services/storage.service.js');
      const storagePath = storageService.getStorageInstance().path;

      console.log(chalk.cyan('📊 服务状态:'));
      console.log(chalk.gray(`   工具: ${chalk.white('9 个')}`));
      console.log(
        chalk.gray(
          `   缓存: ${chalk.white(`内存 ${cacheStats.memory.size}/${cacheStats.memory.max}`)}` +
            (cacheStats.persistent
              ? ` | ${chalk.white(`磁盘 ${cacheStats.persistent.size}/${cacheStats.persistent.max}`)}`
              : '')
        )
      );
      if (cacheStats.persistent) {
        const homeDir = process.env.HOME || process.env.USERPROFILE || '';
        const displayPath = storagePath.startsWith(homeDir)
          ? '~' + storagePath.slice(homeDir.length)
          : storagePath;
        console.log(chalk.gray(`   位置: ${chalk.white(displayPath)}`));
      }
      console.log('');

      const portInUse = await isPortInUse(config.port);

      if (portInUse) {
        console.log('\n' + chalk.bold.red('═'.repeat(60)));
        console.log(chalk.bold.red(`⚠️  端口 ${config.port} 已被占用`));
        console.log(chalk.bold.red('═'.repeat(60)) + '\n');

        console.log(chalk.yellow('🔧 解决方法：\n'));
        console.log(
          chalk.white('1. 清理占用端口的进程（推荐）：\n   ') +
            chalk.cyan(getPortCleanupCommand(config.port))
        );
        console.log(
          chalk.white('\n2. 使用其他端口启动：\n   ') +
            chalk.cyan(`PORT=3001 node build/index.js`)
        );
        console.log(chalk.white('\n3. 等待几秒后重试（如果刚刚关闭服务）\n'));

        process.exit(1);
      }

      const httpServer = new HttpServer(foxyServer);
      httpServerInstance = httpServer;
      await httpServer.start(config.port);
    }
  } catch (error: any) {
    logger.error('Failed to start', { error: error.message });

    console.log('\n' + chalk.bold.red('═'.repeat(60)));
    console.log(chalk.bold.red('❌ 启动失败'));
    console.log(chalk.bold.red('═'.repeat(60)) + '\n');

    console.log(chalk.white(error.message));
    console.log('');

    process.exit(1);
  }
}

startServer().catch(error => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});
