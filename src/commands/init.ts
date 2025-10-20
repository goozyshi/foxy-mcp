import inquirer from 'inquirer';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';

interface InitConfig {
  authType: 'apiKey' | 'cookieToken';
  apiKey?: string;
  cookieToken?: string;
  projectId?: string;
  mode: 'http' | 'cli';
  port?: number;
  installPath?: string;
}

export async function initCommand(): Promise<void> {
  console.log(chalk.cyan('\n🦊 Foxy MCP 初始化向导\n'));

  try {
    const { authType } = await inquirer.prompt<{
      authType: 'apiKey' | 'cookieToken';
    }>([
      {
        type: 'list',
        name: 'authType',
        message: '选择鉴权方式:',
        choices: [
          {
            name: 'API Key（Apifox 开发者令牌，需要 apifox 权限管理员以上）',
            value: 'apiKey',
          },
          {
            name: 'Cookie Token（网页登录随cookie过期，获取cookie中的Authorization字段）',
            value: 'cookieToken',
          },
        ],
        default: 'apiKey',
      },
    ]);

    let authCredential = '';
    if (authType === 'apiKey') {
      const { apiKey } = await inquirer.prompt<{ apiKey: string }>([
        {
          type: 'password',
          name: 'apiKey',
          message: '请输入 Apifox API Key (APS-开头):',
          validate: (input: string) => {
            if (!input.trim()) {
              return '❌ API Key 不能为空';
            }
            if (!input.startsWith('APS-')) {
              return '⚠️  API Key 通常以 APS- 开头，确认输入正确吗？';
            }
            return true;
          },
        },
      ]);
      authCredential = apiKey;
    } else {
      const { cookieToken } = await inquirer.prompt<{ cookieToken: string }>([
        {
          type: 'password',
          name: 'cookieToken',
          message: '请输入 Cookie Token (浏览器F12 → Cookies → Authorization):',
          validate: (input: string) => {
            if (!input.trim()) {
              return '❌ Cookie Token 不能为空';
            }
            return true;
          },
        },
      ]);
      authCredential = cookieToken.startsWith('Bearer ')
        ? cookieToken
        : `Bearer ${cookieToken}`;
    }

    const { useProjectId } = await inquirer.prompt<{ useProjectId: boolean }>([
      {
        type: 'confirm',
        name: 'useProjectId',
        message: '是否配置默认项目ID？',
        default: true,
      },
    ]);

    let projectId: string | undefined;
    if (useProjectId) {
      const result = await inquirer.prompt<{ projectId: string }>([
        {
          type: 'input',
          name: 'projectId',
          message: '请输入项目ID (可从Apifox URL中获取):',
          validate: (input: string) => {
            if (!input.trim()) {
              return '❌ 项目ID不能为空';
            }
            if (!/^\d+$/.test(input.trim())) {
              return '⚠️  项目ID通常是纯数字，确认输入正确吗？';
            }
            return true;
          },
        },
      ]);
      projectId = result.projectId.trim();
    }

    const { mode } = await inquirer.prompt<{ mode: 'http' | 'cli' }>([
      {
        type: 'list',
        name: 'mode',
        message: '选择运行模式:',
        choices: [
          {
            name: 'HTTP模式（团队共享，常驻后台服务）',
            value: 'http',
          },
          {
            name: 'CLI模式（个人使用，Cursor自动管理进程）',
            value: 'cli',
          },
        ],
        default: 'http',
      },
    ]);

    let port: number | undefined;
    let installPath: string | undefined;

    if (mode === 'http') {
      const result = await inquirer.prompt<{ port: string }>([
        {
          type: 'input',
          name: 'port',
          message: '服务端口:',
          default: '3000',
          validate: (input: string) => {
            const portNum = parseInt(input, 10);
            if (isNaN(portNum) || portNum < 1024 || portNum > 65535) {
              return '❌ 端口范围: 1024-65535';
            }
            return true;
          },
        },
      ]);
      port = parseInt(result.port, 10);
    } else {
      installPath = process.cwd();
    }

    const config: InitConfig = {
      authType,
      apiKey: authType === 'apiKey' ? authCredential : undefined,
      cookieToken: authType === 'cookieToken' ? authCredential : undefined,
      projectId,
      mode,
      port,
      installPath,
    };

    await writeEnvFile(config);

    console.log(chalk.green('\n✅ 配置已保存到 .env\n'));
    displayMcpConfig(config);
    displayNextSteps(config);
  } catch (error: any) {
    if (error.isTtyError) {
      console.error(chalk.red('\n❌ 当前环境不支持交互式输入'));
    } else {
      console.error(chalk.red(`\n❌ 初始化失败: ${error.message}`));
    }
    process.exit(1);
  }
}

async function writeEnvFile(config: InitConfig): Promise<void> {
  const envPath = path.join(process.cwd(), '.env');
  const lines: string[] = [
    '# 🦊 Foxy MCP Configuration',
    '# Generated by: foxy-mcp init',
    `# Generated at: ${new Date().toISOString()}`,
    '',
  ];

  if (config.authType === 'apiKey') {
    lines.push(`APIFOX_API_KEY=${config.apiKey}`);
  } else {
    lines.push(`APIFOX_COOKIE_TOKEN=${config.cookieToken}`);
  }

  if (config.projectId) {
    lines.push(`PROJECT_ID=${config.projectId}`);
  }

  if (config.mode === 'http' && config.port) {
    lines.push(`PORT=${config.port}`);
  }

  lines.push('');

  lines.push('# 可选配置');
  lines.push('# LOG_LEVEL=info');
  lines.push('# CACHE_ENABLED=true');
  lines.push('# CACHE_PERSISTENT=true');
  lines.push('# CACHE_TTL=3600000  # 1小时（毫秒）');
  lines.push('');

  fs.writeFileSync(envPath, lines.join('\n'));
}

function displayMcpConfig(config: InitConfig): void {
  console.log(chalk.cyan('📋 复制以下配置到 ~/.cursor/mcp.json:\n'));

  let mcpConfig: any;

  if (config.mode === 'http') {
    mcpConfig = {
      mcpServers: {
        'foxy-mcp': {
          url: `http://localhost:${config.port}/sse`,
        },
      },
    };
  } else {
    const buildPath = path.join(config.installPath!, 'build', 'index.js');
    const env: Record<string, string> = {};

    if (config.authType === 'apiKey') {
      env.APIFOX_API_KEY = config.apiKey!;
    } else {
      env.APIFOX_COOKIE_TOKEN = config.cookieToken!;
    }

    if (config.projectId) {
      env.PROJECT_ID = config.projectId;
    }

    mcpConfig = {
      mcpServers: {
        'foxy-mcp': {
          command: 'node',
          args: [buildPath, '--local'],
          env,
        },
      },
    };
  }

  console.log(chalk.yellow(JSON.stringify(mcpConfig, null, 2)));
  console.log('');
}

function displayNextSteps(config: InitConfig): void {
  console.log(chalk.cyan('🚀 下一步:\n'));

  if (config.mode === 'http') {
    console.log(chalk.white('  1. 启动服务:'));
    console.log(chalk.gray('     $ pnpm start\n'));
    console.log(chalk.white('  2. 复制上面的配置到 ~/.cursor/mcp.json\n'));
    console.log(chalk.white('  3. 重启 Cursor\n'));
  } else {
    console.log(chalk.white('  1. 构建项目（如果还没构建）:'));
    console.log(chalk.gray('     $ pnpm build\n'));
    console.log(chalk.white('  2. 复制上面的配置到 ~/.cursor/mcp.json\n'));
    console.log(chalk.white('  3. 重启 Cursor（Cursor会自动管理进程）\n'));
  }

  console.log(chalk.green('✨ 完成！祝使用愉快！\n'));
}
