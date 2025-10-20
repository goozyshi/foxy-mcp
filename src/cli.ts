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
  .command(['start', '$0'], '🚀 启动 Foxy MCP 服务器', {}, async () => {
    config({ path: resolve(process.cwd(), '.env') });
    await import('./index.js');
  })
  .help('h')
  .alias('h', 'help')
  .version('1.0.0')
  .alias('v', 'version')
  .strict()
  .parse();
