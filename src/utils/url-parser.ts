import type { ApifoxUrlInfo } from '../types/index.js';

/**
 * 解析 Apifox 接口链接
 * @param url - Apifox 链接，如 https://app.apifox.com/link/project/3189010/apis/api-362821568
 * @returns 解析结果
 */
export function parseApifoxUrl(url: string): ApifoxUrlInfo {
  const regex =
    /(?:https?:\/\/)?app\.apifox\.com\/link\/project\/(\d+)\/apis\/api-(\d+)/i;
  const match = url.match(regex);

  if (!match) {
    return {
      projectId: '',
      apiId: 0,
      isValid: false,
    };
  }

  const [, projectId, apiId] = match;

  return {
    projectId,
    apiId: Number(apiId),
    isValid: true,
  };
}
