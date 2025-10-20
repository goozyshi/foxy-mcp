import { getMockDataPool, setMockDataPool } from './storage.service.js';
import { logger } from '../utils/logger.js';

export class DataPoolService {
  addData(
    data: any,
    scope: 'global' | 'project',
    projectId?: string
  ): { added: number; fields: string[] } {
    if (scope === 'project' && !projectId) {
      throw new Error('项目级数据池必须提供 projectId');
    }

    const fieldValues = this.extractFieldValues(data);
    const fieldNames = Object.keys(fieldValues);

    if (fieldNames.length === 0) {
      logger.warn('No field values extracted from data', { data });
      return { added: 0, fields: [] };
    }

    // 2. 获取当前数据池
    const pool = getMockDataPool();

    // 3. 合并到对应的池中
    if (scope === 'global') {
      for (const [field, values] of Object.entries(fieldValues)) {
        if (!pool.global[field]) {
          pool.global[field] = [];
        }
        // 去重合并
        pool.global[field] = [...new Set([...pool.global[field], ...values])];
      }
    } else {
      // 项目级数据池
      if (!pool.projects[projectId!]) {
        pool.projects[projectId!] = {};
      }

      for (const [field, values] of Object.entries(fieldValues)) {
        if (!pool.projects[projectId!][field]) {
          pool.projects[projectId!][field] = [];
        }
        pool.projects[projectId!][field] = [
          ...new Set([...pool.projects[projectId!][field], ...values]),
        ];
      }
    }

    // 4. 保存到磁盘
    setMockDataPool(pool);

    logger.info('✅ Real data added to pool', {
      scope,
      projectId,
      fieldsCount: fieldNames.length,
      totalValues: Object.values(fieldValues).reduce(
        (sum, arr) => sum + arr.length,
        0
      ),
    });

    return { added: fieldNames.length, fields: fieldNames };
  }

  /**
   * 从数据池获取字段值
   * @param fieldName - 字段名
   * @param projectId - 项目ID（优先从项目池查找）
   * @returns 字段值数组（随机顺序）
   */
  getData(fieldName: string, projectId?: string): any[] {
    const pool = getMockDataPool();

    // 1. 归一化字段名（统一为camelCase）
    const normalizedName = this.normalizeFieldName(fieldName);

    // 2. 优先从项目池查找
    if (projectId && pool.projects[projectId]) {
      const projectData = pool.projects[projectId];

      // 精确匹配
      if (projectData[normalizedName]) {
        logger.debug('Data pool HIT (project - exact)', {
          field: fieldName,
          projectId,
          count: projectData[normalizedName].length,
        });
        return this.shuffleArray([...projectData[normalizedName]]);
      }

      // 智能匹配（变体）
      const matchedKey = this.matchFieldName(normalizedName, projectData);
      if (matchedKey && projectData[matchedKey]) {
        logger.debug('Data pool HIT (project - variant)', {
          field: fieldName,
          matched: matchedKey,
          projectId,
          count: projectData[matchedKey].length,
        });
        return this.shuffleArray([...projectData[matchedKey]]);
      }
    }

    // 3. 再从全局池查找
    // 精确匹配
    if (pool.global[normalizedName]) {
      logger.debug('Data pool HIT (global - exact)', {
        field: fieldName,
        count: pool.global[normalizedName].length,
      });
      return this.shuffleArray([...pool.global[normalizedName]]);
    }

    // 智能匹配（变体）
    const matchedKey = this.matchFieldName(normalizedName, pool.global);
    if (matchedKey && pool.global[matchedKey]) {
      logger.debug('Data pool HIT (global - variant)', {
        field: fieldName,
        matched: matchedKey,
        count: pool.global[matchedKey].length,
      });
      return this.shuffleArray([...pool.global[matchedKey]]);
    }

    // 4. 未找到
    logger.debug('Data pool MISS', { field: fieldName, projectId });
    return [];
  }

  /**
   * 列出所有数据池内容
   */
  listAllData(): {
    global: Record<string, any[]>;
    projects: Record<string, Record<string, any[]>>;
  } {
    return getMockDataPool();
  }

  /**
   * 递归提取JSON中的所有字段值
   * @param data - 输入数据
   * @param prefix - 字段路径前缀（内部使用）
   * @returns 字段值映射表
   */
  private extractFieldValues(
    data: any,
    prefix: string = ''
  ): Record<string, any[]> {
    const result: Record<string, any[]> = {};

    // 基础类型：直接返回
    if (data === null || data === undefined) {
      return result;
    }

    if (typeof data !== 'object') {
      return result;
    }

    // 数组：递归处理每个元素
    if (Array.isArray(data)) {
      for (const item of data) {
        const extracted = this.extractFieldValues(item, prefix);
        this.mergeFieldValues(result, extracted);
      }
      return result;
    }

    // 对象：遍历每个字段
    for (const [key, value] of Object.entries(data)) {
      const normalizedKey = this.normalizeFieldName(key);

      if (value === null || value === undefined) {
        continue;
      }

      if (typeof value === 'object') {
        if (Array.isArray(value)) {
          // 数组类型
          if (value.length === 0) {
            continue;
          }

          // 如果数组元素是基础类型，直接存储
          if (typeof value[0] !== 'object') {
            if (!result[normalizedKey]) {
              result[normalizedKey] = [];
            }
            result[normalizedKey].push(...value);
          } else {
            // 如果数组元素是对象，递归提取
            for (const item of value) {
              const extracted = this.extractFieldValues(item, '');
              this.mergeFieldValues(result, extracted);
            }
          }
        } else {
          // 嵌套对象：递归提取
          const extracted = this.extractFieldValues(value, '');
          this.mergeFieldValues(result, extracted);

          // 同时保留扁平化字段名（无路径前缀）
          // 这样 content.list[].uid 会被提取为 "uid"
        }
      } else {
        // 基础类型值：存储
        if (!result[normalizedKey]) {
          result[normalizedKey] = [];
        }

        // 避免存储空字符串或无意义的值
        if (
          value === '' ||
          value === 'null' ||
          value === 'undefined' ||
          value === 'N/A'
        ) {
          continue;
        }

        result[normalizedKey].push(value);
      }
    }

    return result;
  }

  /**
   * 合并字段值（去重）
   */
  private mergeFieldValues(
    target: Record<string, any[]>,
    source: Record<string, any[]>
  ): void {
    for (const [key, values] of Object.entries(source)) {
      if (!target[key]) {
        target[key] = [];
      }
      target[key].push(...values);
    }
  }

  /**
   * 归一化字段名（统一为camelCase）
   */
  private normalizeFieldName(name: string): string {
    // 移除特殊字符
    let normalized = name.replace(/[^\w]/g, '');

    // snake_case -> camelCase
    normalized = normalized.replace(/_([a-z])/g, (_, letter) =>
      letter.toUpperCase()
    );

    // 首字母小写
    normalized = normalized.charAt(0).toLowerCase() + normalized.slice(1);

    return normalized;
  }

  /**
   * 智能匹配字段名（支持变体）
   * @param targetField - 目标字段名（已归一化）
   * @param pool - 数据池
   * @returns 匹配的字段名，或 undefined
   */
  private matchFieldName(
    targetField: string,
    pool: Record<string, any[]>
  ): string | undefined {
    const lowerTarget = targetField.toLowerCase();

    // 1. 精确匹配
    if (pool[targetField]) {
      return targetField;
    }

    // 2. 不区分大小写匹配
    for (const key of Object.keys(pool)) {
      if (key.toLowerCase() === lowerTarget) {
        return key;
      }
    }

    // 3. 语义别名匹配
    const aliases: Record<string, string[]> = {
      uid: ['userId', 'id', 'userid'],
      userid: ['uid', 'id', 'userId'],
      bizid: ['businessId', 'bizId', 'business_id'],
      avatar: ['avatarUrl', 'headimg', 'profilePic', 'profilePicture'],
      avatarthumb: ['avatarThumb', 'avatar_thumb', 'thumbUrl'],
      nickname: ['name', 'userName', 'displayName'],
      username: ['nickname', 'name', 'displayName'],
      token: ['accessToken', 'authToken', 'apiKey'],
    };

    const targetAliases = aliases[lowerTarget] || [];
    for (const alias of targetAliases) {
      const normalizedAlias = this.normalizeFieldName(alias);
      if (pool[normalizedAlias]) {
        return normalizedAlias;
      }
    }

    // 4. 子串包含匹配（宽松匹配，优先级最低）
    for (const key of Object.keys(pool)) {
      const lowerKey = key.toLowerCase();
      if (lowerKey.includes(lowerTarget) || lowerTarget.includes(lowerKey)) {
        // 长度差异不能太大（避免误匹配）
        if (Math.abs(lowerKey.length - lowerTarget.length) <= 3) {
          return key;
        }
      }
    }

    return undefined;
  }

  /**
   * 随机打乱数组（避免总是返回相同的值）
   */
  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
}
