import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { CacheOptions } from '../types/index.js';
import { ApifoxService } from '../services/apifox.service.js';
import { MockService } from '../services/mock.service.js';
import { DataPoolService } from '../services/data-pool.service.js';
import { logger } from '../utils/logger.js';
import { parseApifoxUrl } from '../utils/url-parser.js';

export class FoxyMcpServer {
  private readonly server: McpServer;
  private readonly apifoxService: ApifoxService;
  private readonly mockService: MockService;
  private readonly dataPoolService: DataPoolService;

  constructor(
    authConfig: {
      apiKey?: string;
      cookieToken?: string;
    },
    private defaultProjectId?: string,
    cacheOptions?: CacheOptions
  ) {
    this.server = new McpServer({
      name: '🦊 Foxy MCP',
      version: '1.0.0',
    });

    this.apifoxService = new ApifoxService(authConfig, cacheOptions);
    this.dataPoolService = new DataPoolService();
    this.mockService = new MockService();

    // 将数据池服务注入到 Mock 服务
    this.mockService.setDataPoolService(this.dataPoolService);

    this.registerTools();
  }

  private registerTools(): void {
    this.server.tool(
      'get-openapi-doc',
      '获取Apifox文件夹的OpenAPI文档',
      {
        projectId: z
          .string()
          .optional()
          .describe('项目ID（可选，未提供则使用默认项目）'),
        folderId: z.string().describe('文件夹ID'),
        folderName: z.string().optional().describe('文件夹名称'),
      },
      async args => {
        try {
          const projectId = args.projectId || this.defaultProjectId;

          if (!projectId) {
            return {
              content: [
                {
                  type: 'text',
                  text: '❌ 错误：未提供项目ID，且未配置默认项目ID',
                },
              ],
            };
          }

          logger.info('Getting OpenAPI doc', {
            projectId,
            folderId: args.folderId,
          });

          const result = await this.apifoxService.exportOpenApi(
            projectId,
            args.folderId
          );

          const folderNameText = args.folderName ? `${args.folderName}的` : '';

          let cacheInfo = '';
          if (result.fromCache) {
            const icon = result.cacheSource === 'memory' ? '💾' : '💿';
            const source = result.cacheSource === 'memory' ? '内存' : '磁盘';
            cacheInfo = `\n${icon} [缓存命中 - ${source}] 数据来自本地缓存\n`;
          } else {
            cacheInfo = '\n🌐 [实时获取] 已缓存供下次使用\n';
          }

          return {
            content: [
              {
                type: 'text',
                text: `✅ 成功获取${folderNameText}接口信息（OpenAPI 3.1规范）${cacheInfo}\n${JSON.stringify(result.document, null, 2)}`,
              },
            ],
          };
        } catch (error: any) {
          logger.error('Tool execution failed', {
            tool: 'get-openapi-doc',
            error: error.message,
          });

          return {
            content: [
              {
                type: 'text',
                text: `❌ 获取接口信息失败：${error.message}`,
              },
            ],
          };
        }
      }
    );

    // 工具：通过链接获取接口
    this.server.tool(
      'get-api-by-url',
      '通过Apifox链接获取接口详情（支持形如 https://app.apifox.com/link/project/xxx/apis/api-xxx 的链接）',
      {
        url: z
          .string()
          .describe(
            'Apifox接口链接（如：https://app.apifox.com/link/project/3189010/apis/api-362821568）'
          ),
      },
      async args => {
        try {
          const urlInfo = parseApifoxUrl(args.url);

          if (!urlInfo.isValid) {
            return {
              content: [
                {
                  type: 'text',
                  text: `❌ 无效的Apifox链接格式

请提供类似以下格式的链接：
https://app.apifox.com/link/project/xxx/apis/api-xxx

您提供的链接：${args.url}`,
                },
              ],
            };
          }

          logger.info('Getting API by URL', {
            url: args.url,
            projectId: urlInfo.projectId,
            apiId: urlInfo.apiId,
          });

          const result = await this.apifoxService.exportOpenApi(
            urlInfo.projectId,
            {
              scope: {
                type: 'SELECTED_ENDPOINTS',
                selectedEndpointIds: [urlInfo.apiId],
              },
            },
            args.url
          );

          const pathCount = Object.keys(result.document.paths || {}).length;

          if (pathCount === 0) {
            return {
              content: [
                {
                  type: 'text',
                  text: `⚠️ 未找到接口信息

项目ID: ${urlInfo.projectId}
接口ID: ${urlInfo.apiId}

可能原因：
1. 接口不存在或已被删除
2. 您没有访问该接口的权限
3. 项目ID或接口ID不正确`,
                },
              ],
            };
          }

          let cacheInfo = '';
          if (result.fromCache) {
            const icon = result.cacheSource === 'memory' ? '💾' : '💿';
            const source = result.cacheSource === 'memory' ? '内存' : '磁盘';
            cacheInfo = `${icon} [缓存命中 - ${source}] 数据来自本地缓存\n\n`;
          } else {
            cacheInfo = '🌐 [实时获取] 已缓存供下次使用\n\n';
          }

          return {
            content: [
              {
                type: 'text',
                text: `✅ 成功获取接口详情（OpenAPI 3.1规范）

${cacheInfo}项目ID: ${urlInfo.projectId}
接口ID: ${urlInfo.apiId}
缓存键: api:${urlInfo.projectId}:${urlInfo.apiId}
接口数量: ${pathCount}

${JSON.stringify(result.document, null, 2)}`,
              },
            ],
          };
        } catch (error: any) {
          logger.error('Tool execution failed', {
            tool: 'get-api-by-url',
            url: args.url,
            error: error.message,
          });

          return {
            content: [
              {
                type: 'text',
                text: `❌ 获取接口信息失败：${error.message}`,
              },
            ],
          };
        }
      }
    );

    // 工具：清空缓存
    this.server.tool(
      'clear-cache',
      '清空接口缓存（支持全部清空或按项目清空）',
      {
        projectId: z
          .string()
          .optional()
          .describe('项目ID（可选，不提供则清空所有）'),
      },
      async args => {
        try {
          const cache = this.apifoxService.getCache();

          if (args.projectId) {
            const count = cache.clearProject(args.projectId);
            return {
              content: [
                {
                  type: 'text',
                  text: `✅ 已清空项目 ${args.projectId} 的缓存\n\n清理数量: ${count} 个接口`,
                },
              ],
            };
          } else {
            cache.clear();
            return {
              content: [
                {
                  type: 'text',
                  text: '✅ 已清空所有缓存',
                },
              ],
            };
          }
        } catch (error: any) {
          logger.error('Tool execution failed', {
            tool: 'clear-cache',
            error: error.message,
          });
          return {
            content: [
              {
                type: 'text',
                text: `❌ 清空缓存失败：${error.message}`,
              },
            ],
          };
        }
      }
    );

    // 工具：查看缓存统计
    this.server.tool('cache-stats', '查看缓存统计信息', {}, async () => {
      try {
        const cache = this.apifoxService.getCache();
        const stats = cache.getStats();

        const memoryHitRate =
          stats.memory.hits + stats.memory.misses > 0
            ? (
                (stats.memory.hits /
                  (stats.memory.hits + stats.memory.misses)) *
                100
              ).toFixed(1)
            : '0.0';

        let statsText = `📊 缓存统计信息

【内存缓存】
- 当前数量: ${stats.memory.size} / ${stats.memory.max}
- 命中次数: ${stats.memory.hits}
- 未命中次数: ${stats.memory.misses}
- 命中率: ${memoryHitRate}%`;

        if (stats.persistent) {
          statsText += `

【磁盘缓存】
- 存储数量: ${stats.persistent.size} / ${stats.persistent.max}
- 命中次数: ${stats.persistent.hits}`;
        }

        statsText += `

【索引缓存】
- URL 索引: ${stats.indexes.url}
- 接口名索引: ${stats.indexes.name}
- 路径索引: ${stats.indexes.path}`;

        return {
          content: [
            {
              type: 'text',
              text: statsText,
            },
          ],
        };
      } catch (error: any) {
        logger.error('Tool execution failed', {
          tool: 'cache-stats',
          error: error.message,
        });
        return {
          content: [
            {
              type: 'text',
              text: `❌ 获取统计信息失败：${error.message}`,
            },
          ],
        };
      }
    });

    // 工具：刷新缓存（清除并重新获取单个接口）
    this.server.tool(
      'refresh-cache',
      '刷新单个接口的缓存（清除旧缓存并获取最新数据）',
      {
        url: z
          .string()
          .describe(
            'Apifox接口链接（如：https://app.apifox.com/link/project/4519605/apis/api-175889154）'
          ),
      },
      async args => {
        try {
          const urlInfo = parseApifoxUrl(args.url);

          if (!urlInfo.isValid) {
            return {
              content: [
                {
                  type: 'text',
                  text: `❌ 无效的Apifox链接格式

请提供类似以下格式的链接：
https://app.apifox.com/link/project/xxx/apis/api-xxx

您提供的链接：${args.url}`,
                },
              ],
            };
          }

          logger.info('Refreshing cache', {
            url: args.url,
            projectId: urlInfo.projectId,
            apiId: urlInfo.apiId,
          });

          // 1. 清除缓存
          const cache = this.apifoxService.getCache();
          const cleared = cache.clearByUrl(args.url);

          // 2. 强制重新获取（绕过缓存）
          const result = await this.apifoxService.exportOpenApi(
            urlInfo.projectId,
            {
              scope: {
                type: 'SELECTED_ENDPOINTS',
                selectedEndpointIds: [urlInfo.apiId],
              },
            },
            args.url
          );

          const pathCount = Object.keys(result.document.paths || {}).length;

          if (pathCount === 0) {
            return {
              content: [
                {
                  type: 'text',
                  text: `⚠️ 未找到接口信息

项目ID: ${urlInfo.projectId}
接口ID: ${urlInfo.apiId}

可能原因：
1. 接口不存在或已被删除
2. 您没有访问该接口的权限
3. 项目ID或接口ID不正确`,
                },
              ],
            };
          }

          const cacheStatus = cleared ? '已清除旧缓存' : '无旧缓存';

          return {
            content: [
              {
                type: 'text',
                text: `✅ 缓存已刷新（${cacheStatus}）

🔄 [已获取最新数据] 数据来自Apifox API

项目ID: ${urlInfo.projectId}
接口ID: ${urlInfo.apiId}
缓存键: api:${urlInfo.projectId}:${urlInfo.apiId}
接口数量: ${pathCount}

${JSON.stringify(result.document, null, 2)}`,
              },
            ],
          };
        } catch (error: any) {
          logger.error('Tool execution failed', {
            tool: 'refresh-cache',
            url: args.url,
            error: error.message,
          });

          return {
            content: [
              {
                type: 'text',
                text: `❌ 刷新缓存失败：${error.message}`,
              },
            ],
          };
        }
      }
    );

    // 工具：生成Mock数据
    this.server.tool(
      'generate-mock-data',
      '基于接口定义生成Mock数据（支持请求体和响应体）',
      {
        url: z.string().describe('Apifox接口链接'),
        type: z.enum(['request', 'response']).describe('生成请求体还是响应体'),
        statusCode: z
          .string()
          .optional()
          .describe('响应状态码（默认200，仅type=response时有效）'),
      },
      async args => {
        try {
          const urlInfo = parseApifoxUrl(args.url);

          if (!urlInfo.isValid) {
            return {
              content: [
                {
                  type: 'text',
                  text: `❌ 无效的Apifox链接格式

请提供类似以下格式的链接：
https://app.apifox.com/link/project/xxx/apis/api-xxx

您提供的链接：${args.url}`,
                },
              ],
            };
          }

          logger.info('Generating mock data', {
            url: args.url,
            type: args.type,
            statusCode: args.statusCode,
          });

          // 1. 获取接口文档（优先从缓存）
          const result = await this.apifoxService.exportOpenApi(
            urlInfo.projectId,
            {
              scope: {
                type: 'SELECTED_ENDPOINTS',
                selectedEndpointIds: [urlInfo.apiId],
              },
            },
            args.url
          );

          const doc = result.document;
          const pathKeys = Object.keys(doc.paths || {});

          if (pathKeys.length === 0) {
            return {
              content: [
                {
                  type: 'text',
                  text: `⚠️ 未找到接口信息

项目ID: ${urlInfo.projectId}
接口ID: ${urlInfo.apiId}

可能原因：
1. 接口不存在或已被删除
2. 您没有访问该接口的权限
3. 项目ID或接口ID不正确`,
                },
              ],
            };
          }

          const path = pathKeys[0];
          const methodKeys = Object.keys(doc.paths[path]);
          const method = methodKeys[0];

          // 2. 设置当前项目ID（用于数据池优先级）
          this.mockService.setCurrentProjectId(urlInfo.projectId);

          // 3. 生成 Mock 数据
          let mockData: any;
          if (args.type === 'request') {
            mockData = this.mockService.generateRequestMock(doc, path, method);
          } else {
            mockData = this.mockService.generateResponseMock(
              doc,
              path,
              method,
              args.statusCode || '200'
            );
          }

          if (!mockData) {
            return {
              content: [
                {
                  type: 'text',
                  text: `⚠️ 未找到${args.type === 'request' ? '请求体' : '响应体'}定义

接口: ${method.toUpperCase()} ${path}
${args.statusCode ? `状态码: ${args.statusCode}` : ''}

可能原因：
1. 该接口没有定义${args.type === 'request' ? '请求体' : '响应体'}
2. Schema定义为空
3. 状态码不存在（仅响应体）`,
                },
              ],
            };
          }

          const cacheHint = result.fromCache
            ? `💾 [缓存命中 - ${result.cacheSource}]`
            : '🌐 [实时获取]';

          return {
            content: [
              {
                type: 'text',
                text: `✅ Mock数据已生成（基于OpenAPI Schema）

${cacheHint}

接口: ${method.toUpperCase()} ${path}
类型: ${args.type === 'request' ? '请求体示例' : '响应体示例'}
${args.statusCode ? `状态码: ${args.statusCode}` : ''}

${JSON.stringify(mockData, null, 2)}

💡 提示: 数据由 @faker-js/faker 生成，具有真实感`,
              },
            ],
          };
        } catch (error: any) {
          logger.error('Tool execution failed', {
            tool: 'generate-mock-data',
            url: args.url,
            error: error.message,
          });

          return {
            content: [
              {
                type: 'text',
                text: `❌ 生成Mock数据失败：${error.message}`,
              },
            ],
          };
        }
      }
    );

    // 工具：添加真实数据到数据池
    this.server.tool(
      'add-real-data',
      '添加真实数据到Mock数据池（用于混合生成真实感Mock）',
      {
        data: z.string().describe('真实数据（JSON格式字符串）'),
        scope: z
          .enum(['global', 'project'])
          .describe('存储范围（global=全局，project=项目级）'),
        projectId: z
          .string()
          .optional()
          .describe('项目ID（scope=project时必需）'),
      },
      async args => {
        try {
          // 1. 解析JSON数据
          let parsedData: any;
          try {
            parsedData = JSON.parse(args.data);
          } catch (parseError: any) {
            return {
              content: [
                {
                  type: 'text',
                  text: `❌ JSON解析失败：${parseError.message}\n\n请确保提供的数据是有效的JSON格式`,
                },
              ],
            };
          }

          // 2. 添加到数据池
          const result = this.dataPoolService.addData(
            parsedData,
            args.scope,
            args.projectId
          );

          const scopeText =
            args.scope === 'global'
              ? '全局数据池'
              : `项目${args.projectId}的数据池`;

          logger.info('Real data added', {
            scope: args.scope,
            projectId: args.projectId,
            fieldsCount: result.added,
          });

          return {
            content: [
              {
                type: 'text',
                text: `✅ 真实数据已添加到${scopeText}

📊 统计信息：
- 提取字段数：${result.added}
- 字段列表：${result.fields.slice(0, 10).join(', ')}${result.fields.length > 10 ? '...' : ''}

💡 这些数据将在生成Mock时优先使用，提升Mock真实感`,
              },
            ],
          };
        } catch (error: any) {
          logger.error('Tool execution failed', {
            tool: 'add-real-data',
            error: error.message,
          });

          return {
            content: [
              {
                type: 'text',
                text: `❌ 添加真实数据失败：${error.message}`,
              },
            ],
          };
        }
      }
    );

    // 工具：查看数据池内容
    this.server.tool(
      'list-real-data',
      '查看Mock数据池中的真实数据',
      {
        scope: z
          .enum(['global', 'project', 'all'])
          .optional()
          .describe('查看范围（默认all）'),
        projectId: z
          .string()
          .optional()
          .describe('项目ID（scope=project时必需）'),
      },
      async args => {
        try {
          const pool = this.dataPoolService.listAllData();
          const scope = args.scope || 'all';

          let text = '📦 Mock数据池内容\n\n';

          if (scope === 'global' || scope === 'all') {
            const globalFields = Object.keys(pool.global);
            text += `🌍 全局数据池（${globalFields.length}个字段）\n`;

            if (globalFields.length > 0) {
              for (const field of globalFields.slice(0, 10)) {
                const values = pool.global[field];
                const sample = values.slice(0, 3);
                text += `  • ${field}: ${sample.join(', ')}${values.length > 3 ? ` ... (共${values.length}个值)` : ''}\n`;
              }

              if (globalFields.length > 10) {
                text += `  ... 还有 ${globalFields.length - 10} 个字段\n`;
              }
            } else {
              text += '  (空)\n';
            }
            text += '\n';
          }

          if (scope === 'project' || scope === 'all') {
            const projectList = Object.keys(pool.projects);

            if (args.projectId) {
              // 查看特定项目
              const projectData = pool.projects[args.projectId] || {};
              const projectFields = Object.keys(projectData);

              text += `🎯 项目${args.projectId}数据池（${projectFields.length}个字段）\n`;

              if (projectFields.length > 0) {
                for (const field of projectFields.slice(0, 10)) {
                  const values = projectData[field];
                  const sample = values.slice(0, 3);
                  text += `  • ${field}: ${sample.join(', ')}${values.length > 3 ? ` ... (共${values.length}个值)` : ''}\n`;
                }

                if (projectFields.length > 10) {
                  text += `  ... 还有 ${projectFields.length - 10} 个字段\n`;
                }
              } else {
                text += '  (空)\n';
              }
            } else {
              // 查看所有项目
              text += `🎯 项目数据池（${projectList.length}个项目）\n`;

              if (projectList.length > 0) {
                for (const projectId of projectList) {
                  const fieldsCount = Object.keys(
                    pool.projects[projectId]
                  ).length;
                  text += `  • 项目${projectId}: ${fieldsCount}个字段\n`;
                }
              } else {
                text += '  (空)\n';
              }
            }
          }

          return {
            content: [
              {
                type: 'text',
                text,
              },
            ],
          };
        } catch (error: any) {
          logger.error('Tool execution failed', {
            tool: 'list-real-data',
            error: error.message,
          });

          return {
            content: [
              {
                type: 'text',
                text: `❌ 查看数据池失败：${error.message}`,
              },
            ],
          };
        }
      }
    );

    // 工具：清空数据池
    this.server.tool(
      'clear-real-data',
      '清空Mock数据池中的真实数据',
      {
        scope: z
          .enum(['global', 'project', 'all'])
          .describe('清空范围（global=全局，project=项目，all=全部）'),
        projectId: z
          .string()
          .optional()
          .describe('项目ID（scope=project时必需）'),
      },
      async args => {
        try {
          const { clearDataPool } = await import(
            '../services/storage.service.js'
          );

          const result = clearDataPool(args.scope, args.projectId);

          logger.warn('Data pool cleared', {
            scope: args.scope,
            projectId: args.projectId,
            cleared: result.cleared,
          });

          return {
            content: [
              {
                type: 'text',
                text: `✅ ${result.message}

⚠️ 注意：缓存数据未受影响，仅清空了真实数据池`,
              },
            ],
          };
        } catch (error: any) {
          logger.error('Tool execution failed', {
            tool: 'clear-real-data',
            error: error.message,
          });

          return {
            content: [
              {
                type: 'text',
                text: `❌ 清空数据池失败：${error.message}`,
              },
            ],
          };
        }
      }
    );

    logger.debug('MCP tools registered', { count: 9 });
  }

  /**
   * 连接传输层（Stdio或SSE）
   */
  async connect(transport: any): Promise<void> {
    await this.server.connect(transport);
    // CLI 模式下输出到 stderr，避免干扰 stdio 通信
    if (process.env.NODE_ENV === 'cli') {
      console.error('🦊 Foxy MCP Server - CLI 模式已连接，等待请求...');
    } else {
      logger.debug('Server connected');
    }
  }

  getServer(): McpServer {
    return this.server;
  }

  /**
   * 获取缓存统计信息
   */
  getCacheStats() {
    return this.apifoxService.getCache().getStats();
  }

  /**
   * 优雅关闭（刷新缓存到磁盘）
   */
  async shutdown(): Promise<void> {
    const cache = this.apifoxService.getCache();
    await cache.shutdown();
  }
}
