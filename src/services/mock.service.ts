import OpenAPISampler from 'openapi-sampler';
import { faker } from '@faker-js/faker/locale/zh_CN';
import type { OpenApiDocument } from '../types/index.js';
import type { DataPoolService } from './data-pool.service.js';
import { logger } from '../utils/logger.js';

export interface MockOptions {
  skipReadOnly?: boolean;
  skipNonRequired?: boolean;
}

export class MockService {
  private dataPoolService?: DataPoolService;
  private currentProjectId?: string;

  setDataPoolService(service: DataPoolService): void {
    this.dataPoolService = service;
  }

  setCurrentProjectId(projectId?: string): void {
    this.currentProjectId = projectId;
  }
  /**
   * 从 OpenAPI Schema 生成 Mock 数据
   */
  generateFromSchema(schema: any, options?: MockOptions): any {
    if (!schema) {
      logger.warn('Empty schema provided for mock generation');
      return null;
    }

    try {
      // 1. 使用 openapi-sampler 生成基础数据
      const baseMock = OpenAPISampler.sample(schema, {
        skipReadOnly: options?.skipReadOnly ?? false,
        skipNonRequired: options?.skipNonRequired ?? false,
      });

      // 2. 使用 faker 增强数据真实感
      return this.enhanceWithFaker(baseMock, schema);
    } catch (error: any) {
      logger.error('Failed to generate mock from schema', {
        error: error.message,
      });
      return null;
    }
  }

  /**
   * 从接口文档生成请求体 Mock
   */
  generateRequestMock(
    openApiDoc: OpenApiDocument,
    path: string,
    method: string
  ): any {
    try {
      const operation = openApiDoc.paths?.[path]?.[method.toLowerCase()];
      if (!operation) {
        logger.warn('Operation not found', { path, method });
        return null;
      }

      const requestBody = (operation as any).requestBody;
      if (!requestBody) {
        logger.debug('No request body defined', { path, method });
        return null;
      }

      const schema = requestBody.content?.['application/json']?.schema;
      if (!schema) {
        logger.debug('No JSON schema in request body', { path, method });
        return null;
      }

      return this.generateFromSchema(schema);
    } catch (error: any) {
      logger.error('Failed to generate request mock', {
        path,
        method,
        error: error.message,
      });
      return null;
    }
  }

  /**
   * 从接口文档生成响应体 Mock
   */
  generateResponseMock(
    openApiDoc: OpenApiDocument,
    path: string,
    method: string,
    statusCode: string = '200'
  ): any {
    try {
      const operation = openApiDoc.paths?.[path]?.[method.toLowerCase()];
      if (!operation) {
        logger.warn('Operation not found', { path, method });
        return null;
      }

      const responses = (operation as any).responses;
      if (!responses) {
        logger.warn('No responses defined', { path, method });
        return null;
      }

      const response = responses[statusCode];
      if (!response) {
        logger.warn('Status code not found', { path, method, statusCode });
        return null;
      }

      const schema = response.content?.['application/json']?.schema;
      if (!schema) {
        logger.debug('No JSON schema in response', {
          path,
          method,
          statusCode,
        });
        return null;
      }

      return this.generateFromSchema(schema);
    } catch (error: any) {
      logger.error('Failed to generate response mock', {
        path,
        method,
        statusCode,
        error: error.message,
      });
      return null;
    }
  }

  /**
   * 使用 Faker 增强数据真实感
   */
  private enhanceWithFaker(data: any, schema: any): any {
    if (data === null || data === undefined) return data;

    // 基础类型直接返回
    if (typeof data !== 'object') return data;

    // 数组：递归处理每个元素
    if (Array.isArray(data)) {
      return data.map(item => this.enhanceWithFaker(item, schema?.items));
    }

    // 对象：递归处理每个字段
    const result: any = {};
    for (const key in data) {
      const value = data[key];
      const fieldSchema = schema?.properties?.[key];

      if (typeof value === 'string') {
        // 字符串类型：根据字段名智能生成
        result[key] = this.generateSmartValue(key, value, fieldSchema);
      } else if (typeof value === 'object' && value !== null) {
        // 嵌套对象：递归处理
        result[key] = this.enhanceWithFaker(value, fieldSchema);
      } else {
        // 其他类型：保持原值
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * 智能生成字段值（根据字段名推断）
   */
  private generateSmartValue(
    fieldName: string,
    defaultValue: string,
    schema?: any
  ): string {
    const lowerName = fieldName.toLowerCase();

    // 1. 优先使用 schema 中的 example
    if (schema?.example) return schema.example;

    // 2. 从数据池获取真实数据（优先级最高）
    if (this.dataPoolService) {
      const poolData = this.dataPoolService.getData(
        fieldName,
        this.currentProjectId
      );

      if (poolData && poolData.length > 0) {
        // 随机选择一个值（数据池已经打乱顺序）
        const value = poolData[0];
        logger.debug('Using value from data pool', {
          field: fieldName,
          valueType: typeof value,
        });
        return String(value); // 转换为字符串返回
      }
    }

    // 邮箱
    if (
      lowerName.includes('email') ||
      lowerName.includes('mail') ||
      lowerName === 'email'
    ) {
      return faker.internet.email();
    }

    // 手机号
    if (
      lowerName.includes('phone') ||
      lowerName.includes('mobile') ||
      lowerName.includes('tel')
    ) {
      return `1${faker.string.numeric(10)}`;
    }

    // 姓名
    if (
      (lowerName.includes('name') && !lowerName.includes('username')) ||
      lowerName === 'realname'
    ) {
      return faker.person.fullName();
    }

    // 用户名
    if (lowerName.includes('username') || lowerName === 'user') {
      return faker.internet.username();
    }

    // URL/链接
    if (lowerName.includes('url') || lowerName.includes('link')) {
      return faker.internet.url();
    }

    // 头像
    if (lowerName.includes('avatar') || lowerName.includes('headimg')) {
      return faker.image.avatar();
    }

    // 图片
    if (
      lowerName.includes('image') ||
      lowerName.includes('img') ||
      lowerName.includes('picture') ||
      lowerName.includes('photo')
    ) {
      return faker.image.url();
    }

    // Token
    if (lowerName.includes('token')) {
      return faker.string.alphanumeric(64);
    }

    // UUID/ID
    if (lowerName.includes('uuid') || lowerName === 'id') {
      return faker.string.uuid();
    }

    // 日期时间
    if (
      lowerName.includes('date') ||
      lowerName.includes('time') ||
      lowerName.includes('createdat') ||
      lowerName.includes('updatedat')
    ) {
      return faker.date.recent().toISOString();
    }

    // 地址
    if (lowerName.includes('address') || lowerName.includes('addr')) {
      return faker.location.streetAddress();
    }

    // 城市
    if (lowerName.includes('city')) {
      return faker.location.city();
    }

    // 省份
    if (lowerName.includes('province') || lowerName.includes('state')) {
      return faker.location.state();
    }

    // 公司
    if (lowerName.includes('company') || lowerName.includes('corporation')) {
      return faker.company.name();
    }

    // 标题
    if (lowerName.includes('title')) {
      return faker.lorem.sentence();
    }

    // 描述/内容
    if (
      lowerName.includes('desc') ||
      lowerName.includes('content') ||
      lowerName.includes('message')
    ) {
      return faker.lorem.paragraph();
    }

    // 颜色
    if (lowerName.includes('color')) {
      return faker.color.rgb();
    }

    // 默认：返回原值或生成随机文本
    if (defaultValue && defaultValue.length > 0) {
      return defaultValue;
    }

    return faker.lorem.words(3);
  }
}
