#!/usr/bin/env node
import { resolve } from 'path';
import { config } from 'dotenv';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

yargs(hideBin(process.argv))
  .command('intro', '🦊 交互式初始化向导', {}, async () => {
    const { initCommand } = await import('./commands/intro.js');
    await initCommand();
    process.exit(0);
  })
  .command(
    ['start', '$0'],
    '🚀 启动 Foxy MCP 服务器',
    yargs => {
      return yargs.options({
        'apifox-api-key': {
          type: 'string',
          describe: 'Apifox API密钥',
          alias: 'k',
        },
        'project-id': {
          type: 'string',
          describe: 'Apifox项目ID',
          alias: 'p',
        },
        'apifox-cookie-token': {
          type: 'string',
          describe: 'Apifox Cookie Token (用于调试)',
        },
        port: {
          type: 'number',
          describe: 'HTTP服务器端口（不指定则使用CLI模式）',
        },
        local: {
          type: 'boolean',
          describe: 'CLI模式（使用stdio传输）',
          default: false,
        },
      });
    },
    async argv => {
      // 如果指定了 --local，设置环境变量触发 CLI 模式
      if (argv.local) {
        process.env.NODE_ENV = 'cli';
      }

      config({ path: resolve(process.cwd(), '.env') });
      await import('./index.js');
    }
  )
  .example(
    '$0 --apifox-api-key=APS-xxx --project-id=123456 --local',
    '使用 API Key 启动 CLI 模式'
  )
  .example(
    '$0 --apifox-api-key=APS-xxx --port=3000',
    '使用 API Key 启动 HTTP 模式'
  )
  .example('$0 intro', '运行交互式配置向导')
  .help('h')
  .alias('h', 'help')
  .version('1.0.0')
  .alias('v', 'version')
  .strict()
  .parse();
