import ky from 'ky';
import type {
  ApifoxExportOptions,
  OpenApiDocument,
  CacheOptions,
  CachedApiMetadata,
} from '../types/index.js';
import { logger } from '../utils/logger.js';
import { CacheService } from './cache.service.js';

export class ApifoxService {
  private client: typeof ky;
  private cache: CacheService;

  constructor(
    private authConfig: {
      apiKey?: string;
      cookieToken?: string;
    },
    cacheOptions?: CacheOptions
  ) {
    if (!authConfig.apiKey && !authConfig.cookieToken) {
      throw new Error(
        '❌ 鉴权配置错误：未提供任何鉴权凭证\n\n' +
          '请至少提供以下一种鉴权方式：\n' +
          '  • APIFOX_API_KEY - Apifox 开发者令牌（推荐）\n' +
          '  • APIFOX_COOKIE_TOKEN - 浏览器 Cookie 中的 Authorization 字段\n\n' +
          '💡 快速配置：运行 `pnpm init` 使用交互式向导'
      );
    }

    if (authConfig.apiKey) {
      if (!authConfig.apiKey.trim()) {
        throw new Error(
          '❌ 鉴权配置错误：APIFOX_API_KEY 不能为空\n\n' +
            '请检查 .env 文件或环境变量配置'
        );
      }
      if (!authConfig.apiKey.startsWith('APS-')) {
        logger.warn('⚠️  API Key 格式异常：通常以 APS- 开头，请确认配置正确');
      }
      logger.debug('Using API Key authentication (Developer Token)');
    }

    if (authConfig.cookieToken) {
      if (!authConfig.cookieToken.trim()) {
        throw new Error(
          '❌ 鉴权配置错误：APIFOX_COOKIE_TOKEN 不能为空\n\n' +
            '请检查 .env 文件或环境变量配置'
        );
      }
      const token = authConfig.cookieToken.trim();
      if (!token.startsWith('Bearer ') && !token.startsWith('bearer ')) {
        logger.warn(
          '⚠️  Cookie Token 格式异常：通常以 Bearer 开头，已自动补全'
        );
      }
      logger.debug('Using Cookie Token authentication (Browser Session)');
    }

    this.cache = new CacheService(cacheOptions);

    this.client = ky.create({
      prefixUrl: 'https://api.apifox.com',
      timeout: 30000,
      retry: {
        limit: 3,
        methods: ['get', 'post'],
        statusCodes: [408, 413, 429, 500, 502, 503, 504],
      },
      hooks: {
        beforeRequest: [
          request => {
            if (this.authConfig.apiKey) {
              request.headers.set(
                'Authorization',
                `Bearer ${this.authConfig.apiKey}`
              );
              request.headers.set('X-Apifox-Api-Version', '2024-03-28');
              logger.debug('Using API Key auth');
            } else if (this.authConfig.cookieToken) {
              // Cookie Token 作为 Authorization 请求头发送
              request.headers.set('Authorization', this.authConfig.cookieToken);
              logger.debug('Using Cookie Token auth', {
                token: this.authConfig.cookieToken.substring(0, 20) + '...',
              });
            }
            request.headers.set('Content-Type', 'application/json');
            logger.debug(`API Request: ${request.url}`);
          },
        ],
        beforeError: [
          error => {
            const { response } = error;
            if (response) {
              if (response.status === 401) {
                // 401 - 鉴权失败
                if (this.authConfig.apiKey) {
                  error.message =
                    '❌ API Key 鉴权失败（401 Unauthorized）\n\n' +
                    '可能的原因：\n' +
                    '  • API Key 已过期或被撤销\n' +
                    '  • API Key 格式错误\n' +
                    '  • 账号权限不足（需要管理员以上权限）\n\n' +
                    '解决方案：\n' +
                    '  1. 前往 Apifox → 个人设置 → 开发者令牌\n' +
                    '  2. 重新生成 API Key\n' +
                    '  3. 更新 .env 文件中的 APIFOX_API_KEY\n' +
                    '  4. 重启服务';
                } else if (this.authConfig.cookieToken) {
                  error.message =
                    '❌ Cookie Token 鉴权失败（401 Unauthorized）\n\n' +
                    '可能的原因：\n' +
                    '  • 浏览器会话已过期\n' +
                    '  • Cookie Token 格式错误\n' +
                    '  • 已在浏览器端登出\n\n' +
                    '解决方案：\n' +
                    '  1. 重新登录 Apifox 网页版\n' +
                    '  2. 按 F12 打开开发者工具\n' +
                    '  3. Application → Cookies → 复制 Authorization 字段\n' +
                    '  4. 更新 .env 文件中的 APIFOX_COOKIE_TOKEN\n' +
                    '  5. 重启服务\n\n' +
                    '💡 建议：生产环境请使用 API Key（稳定性更好）';
                }
              } else if (response.status === 403) {
                // 403 - 权限不足
                error.message =
                  '❌ 权限不足（403 Forbidden）\n\n' +
                  '可能的原因：\n' +
                  '  • 当前账号没有访问此项目的权限\n' +
                  '  • API Key 权限级别不足（需要管理员以上）\n\n' +
                  '解决方案：\n' +
                  '  1. 联系项目管理员添加访问权限\n' +
                  '  2. 或使用有权限的账号生成新的 API Key';
              } else if (response.status === 429) {
                error.message =
                  '❌ API 请求频率过高（429 Too Many Requests）\n\n' +
                  '解决方案：\n' +
                  '  • 等待 1-5 分钟后重试\n' +
                  '  • 检查是否有多个服务实例同时运行';
              } else if (response.status === 404) {
                error.message =
                  '❌ 资源不存在（404 Not Found）\n\n' +
                  '可能的原因：\n' +
                  '  • 项目 ID 或接口 ID 错误\n' +
                  '  • 接口已被删除\n' +
                  '  • URL 解析错误\n\n' +
                  '请检查提供的项目 ID 和接口链接是否正确';
              }
            }
            return error;
          },
        ],
      },
    });
  }

  /**
   * 导出OpenAPI文档
   * @param projectId - 项目ID
   * @param optionsOrFolderId - 完整配置或文件夹ID（向后兼容）
   * @param url - Apifox URL（用于缓存）
   */
  async exportOpenApi(
    projectId: string,
    optionsOrFolderId: ApifoxExportOptions | string,
    url?: string
  ): Promise<{
    document: OpenApiDocument;
    fromCache: boolean;
    cacheSource?: 'memory' | 'disk';
  }> {
    try {
      let options: ApifoxExportOptions;

      // 向后兼容：如果传入的是字符串，转换为旧格式
      if (typeof optionsOrFolderId === 'string') {
        logger.debug('Using legacy folderId format', {
          folderId: optionsOrFolderId,
        });
        options = {
          scope: {
            type: 'SELECTED_FOLDERS',
            selectedFolderIds: [Number(optionsOrFolderId)],
          },
          options: {
            includeApifoxExtensionProperties: false,
            addFoldersToTags: true,
          },
          oasVersion: '3.1',
          exportFormat: 'JSON',
        };
      } else {
        options = {
          options: {
            includeApifoxExtensionProperties: false,
            addFoldersToTags: true,
            ...optionsOrFolderId.options,
          },
          oasVersion: optionsOrFolderId.oasVersion || '3.1',
          exportFormat: optionsOrFolderId.exportFormat || 'JSON',
          scope: optionsOrFolderId.scope,
        };
      }

      // 尝试从缓存获取（仅支持单个接口）
      if (
        options.scope.type === 'SELECTED_ENDPOINTS' &&
        options.scope.selectedEndpointIds.length === 1
      ) {
        const apiId = options.scope.selectedEndpointIds[0];

        // 先尝试通过 URL 查找
        if (url) {
          const cached = this.cache.findByUrl(url);
          if (cached) {
            return {
              document: cached.entry.document,
              fromCache: true,
              cacheSource: cached.source,
            };
          }
        }

        // 再尝试通过 apiId 直接获取
        const cached = this.cache.getApi(projectId, apiId);
        if (cached) {
          return {
            document: cached.entry.document,
            fromCache: true,
            cacheSource: cached.source,
          };
        }
      }

      // 缓存未命中，调用 API
      logger.debug('Exporting OpenAPI', {
        projectId,
        scopeType: options.scope.type,
      });

      const response = await this.client
        .post(`v1/projects/${projectId}/export-openapi`, {
          json: options,
        })
        .json<OpenApiDocument>();

      logger.debug('OpenAPI exported successfully', {
        projectId,
        scopeType: options.scope.type,
        pathCount: Object.keys(response.paths || {}).length,
      });

      // 存入缓存（仅支持单个接口）
      if (
        options.scope.type === 'SELECTED_ENDPOINTS' &&
        options.scope.selectedEndpointIds.length === 1
      ) {
        const apiId = options.scope.selectedEndpointIds[0];
        const metadata = this.extractMetadata(response, projectId, apiId, url);

        if (metadata) {
          this.cache.setApi({
            document: response,
            metadata,
          });
        }
      }

      return {
        document: response,
        fromCache: false,
      };
    } catch (error: any) {
      logger.error('Failed to export OpenAPI', {
        projectId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * 从 OpenAPI 文档中提取元数据
   */
  private extractMetadata(
    doc: OpenApiDocument,
    projectId: string,
    apiId: number,
    url?: string
  ): CachedApiMetadata | null {
    // 从 paths 中提取第一个接口的信息
    const paths = Object.entries(doc.paths || {});

    if (paths.length === 0) {
      return null;
    }

    const [path, methods] = paths[0];
    const [method, operation] = Object.entries(methods)[0];

    const op = operation as any;

    return {
      apiId,
      projectId,
      name: op.summary || op.operationId || path,
      path,
      method: method.toUpperCase(),
      url,
      cachedAt: Date.now(),
    };
  }

  /**
   * 获取缓存服务实例（用于外部管理）
   */
  getCache(): CacheService {
    return this.cache;
  }
}
