import express, { Request, Response } from 'express';
import { IncomingMessage, ServerResponse } from 'http';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import chalk from 'chalk';
import { FoxyMcpServer } from './server.js';
import { logger } from '../utils/logger.js';

export class HttpServer {
  private app: express.Application;
  private httpServer: any = null;
  private sseTransport: SSEServerTransport | null = null;
  private connections: Map<
    string,
    { response: ServerResponse; connectedAt: Date }
  > = new Map();
  private isShuttingDown: boolean = false;

  constructor(private foxyServer: FoxyMcpServer) {
    this.app = express();

    this.app.use((req, _res, next) => {
      logger.debug(`${req.method} ${req.path}`);
      next();
    });

    this.app.use((req, res, next) => {
      if (req.path !== '/sse') {
        req.setTimeout(30000);
        res.setTimeout(30000);
      }
      next();
    });

    this.setupRoutes();
  }

  private setupRoutes(): void {
    // SSE 端点
    this.app.get('/sse', async (_req: Request, res: Response) => {
      const clientId = `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const serverRes = res as unknown as ServerResponse<IncomingMessage>;

      logger.info('📡 SSE connected', { id: clientId });

      // 记录连接
      this.connections.set(clientId, {
        response: serverRes,
        connectedAt: new Date(),
      });

      // 连接关闭时清理
      serverRes.on('close', () => {
        this.connections.delete(clientId);
        logger.info('📡 SSE closed', { id: clientId });
      });

      // 错误处理
      serverRes.on('error', error => {
        logger.error('SSE error', { id: clientId, error: error.message });
        this.connections.delete(clientId);
      });

      this.sseTransport = new SSEServerTransport('/messages', serverRes);
      await this.foxyServer.connect(this.sseTransport);
    });

    // 消息端点
    this.app.post('/messages', async (req: Request, res: Response) => {
      if (!this.sseTransport) {
        res.status(400).send();
        return;
      }
      await this.sseTransport.handlePostMessage(
        req as unknown as IncomingMessage,
        res as unknown as ServerResponse<IncomingMessage>
      );
    });

    // 健康检查
    this.app.get('/health', (_req: Request, res: Response) => {
      const connections = Array.from(this.connections.entries()).map(
        ([id, conn]) => ({
          id,
          connectedAt: conn.connectedAt,
          duration: Math.floor(
            (Date.now() - conn.connectedAt.getTime()) / 1000
          ),
        })
      );

      res.json({
        status: 'ok',
        mode: 'http-sse',
        connections: {
          active: this.connections.size,
          details: connections,
        },
        timestamp: new Date().toISOString(),
      });
    });

    // 根路径
    this.app.get('/', (_req: Request, res: Response) => {
      res.json({
        name: '🦊 Foxy MCP Server',
        version: '1.0.0',
        mode: 'HTTP (SSE)',
      });
    });

    // 错误处理
    this.app.use(
      (
        err: Error,
        _req: Request,
        res: Response,
        _next: express.NextFunction
      ) => {
        logger.error('HTTP error', { error: err.message });
        if (!res.headersSent) {
          res.status(500).json({ error: 'Internal server error' });
        }
      }
    );

    // 404
    this.app.use((_req: Request, res: Response) => {
      res.status(404).json({ error: 'Not found' });
    });
  }

  async start(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.httpServer = this.app.listen(port, () => {
          console.log('\n' + chalk.bold.cyan('═'.repeat(60)));
          console.log(
            chalk.bold.cyan('🦊 Foxy MCP Server - HTTP 模式启动成功')
          );
          console.log(chalk.bold.cyan('═'.repeat(60)));

          console.log('\n' + chalk.bold('📡 服务端点:'));
          console.log(
            `   SSE:    ${chalk.green.underline(`http://localhost:${port}/sse`)}`
          );
          console.log(
            `   Health: ${chalk.gray(`http://localhost:${port}/health`)}`
          );

          console.log('\n' + chalk.bold.yellow('═'.repeat(60)));
          console.log(
            chalk.bold.yellow(
              '📋 复制以下配置到 ~/.cursor/mcp.json 后重启 Cursor:'
            )
          );
          console.log(chalk.bold.yellow('═'.repeat(60)) + '\n');

          const mcpConfig = {
            mcpServers: {
              'foxy-mcp-http': {
                url: `http://localhost:${port}/sse`,
              },
            },
          };

          console.log(chalk.green(JSON.stringify(mcpConfig, null, 2)));

          console.log('\n' + chalk.bold.yellow('═'.repeat(60)));
          console.log(chalk.dim('💡 提示: Ctrl+C 停止服务\n'));

          resolve();
        });

        this.httpServer.on('error', (error: any) => {
          if (error.code === 'EADDRINUSE') {
            logger.error('端口被占用', { port, error: error.message });
          }
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 优雅关闭服务器
   */
  async stop(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    console.log(chalk.yellow('\n⏳ 正在关闭服务器...'));

    try {
      const connectionCount = this.connections.size;
      if (connectionCount > 0) {
        console.log(chalk.dim(`   关闭 ${connectionCount} 个活跃连接...`));
        for (const [id, conn] of this.connections.entries()) {
          try {
            conn.response.end();
            this.connections.delete(id);
          } catch (error) {
            logger.debug('关闭连接失败', { id });
          }
        }
      }

      if (this.httpServer) {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('关闭超时'));
          }, 5000);

          this.httpServer.close((err: Error | undefined) => {
            clearTimeout(timeout);
            if (err) reject(err);
            else resolve();
          });
        });
      }

      console.log(chalk.green('✅ 服务器已安全关闭\n'));
    } catch (error: any) {
      console.log(chalk.yellow(`⚠️  关闭过程遇到问题: ${error.message}`));
      console.log(chalk.dim('   强制退出...\n'));
    }
  }
}
