import { getConfig } from './env.ts';

const REST_BASE = 'https://restapi.amap.com';
const TIMEOUT_MS = 5000;

/** 高德 infocode → 中文可读错误。未知码原样带上，方便排查。 */
const INFOCODE_TEXT: Record<string, string> = {
  '10000': 'OK',
  '10001': 'Key 不正确或已过期，请检查 .env 里的高德 Key',
  '10002': '没有权限使用该服务，请在高德控制台为 Key 开通对应服务',
  '10003': '今日调用量已超限，请明天再试或在高德控制台提额',
  '10004': '单位时间内访问过于频繁，请稍后再试',
  '10005': 'IP 白名单限制，当前出口 IP 不在白名单内',
  '10008': '安全密钥校验失败，请检查 AMAP_SECURITY_CODE 与 Key 是否配对',
  '10009': 'Key 与平台不匹配（这个 Key 不是「Web服务」类型）',
  '10012': '当前 Key 未开通该服务',
  '20000': '请求参数错误，请检查坐标或关键词',
  '20003': '未知的错误，请稍后再试',
  '20800': '规划的路径过长，请缩小范围',
  '20802': '服务响应超时，请稍后再试',
};

export function infocodeText(infocode: string | undefined, fallback = '高德服务返回了未知错误'): string {
  if (!infocode) return fallback;
  return INFOCODE_TEXT[infocode] ?? `${fallback}（infocode=${infocode}）`;
}

export class AmapError extends Error {
  readonly infocode: string | undefined;
  constructor(message: string, infocode?: string) {
    super(message);
    this.name = 'AmapError';
    this.infocode = infocode;
  }
}

export interface AmapQuery {
  [key: string]: string | number | undefined;
}

/** 调高德 Web 服务（GET），注入 key 并对 infocode 做统一处理。 */
export async function amapGet(
  path: string,
  params: AmapQuery,
  options: { retry?: number } = {},
): Promise<Record<string, unknown>> {
  const config = getConfig();
  const url = new URL(REST_BASE + path);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  url.searchParams.set('key', config.webKey);
  url.searchParams.set('output', 'JSON');

  const attempts = 1 + (options.retry ?? 1);
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) throw new AmapError(`高德服务返回 HTTP ${res.status}`);
      const body = (await res.json()) as Record<string, unknown>;
      const status = String(body.status ?? '0');
      if (status !== '1') {
        const infocode = body.infocode === undefined ? undefined : String(body.infocode);
        // 配额 / key / 权限类错误重试没有意义，直接抛出
        if (infocode && /^1000[1-9]$/.test(infocode)) throw new AmapError(infocodeText(infocode), infocode);
        lastError = new AmapError(infocodeText(infocode), infocode);
        continue;
      }
      return body;
    } catch (error) {
      lastError = error;
      if (error instanceof AmapError && error.infocode && /^1000[1-9]$/.test(error.infocode)) throw error;
    }
  }
  if (lastError instanceof AmapError) throw lastError;
  throw new AmapError(`连接高德服务失败：${(lastError as Error)?.message ?? '未知网络错误'}`);
}

/**
 * 把 /_AMapService/* 转发到 restapi.amap.com，并注入安全密钥。
 * 实测：只加 jscode 会 10009，必须同时带 platform=JS 与 s=rsv3。
 */
export async function handleAmapService(request: Request, url: URL): Promise<Response> {
  if (request.method !== 'GET') {
    return Response.json({ error: '只支持 GET' }, { status: 405 });
  }

  const path = url.pathname.replace(/^\/_AMapService/, '');
  if (!/^\/v[34]\/[A-Za-z0-9/_.-]+$/.test(path)) {
    return Response.json({ error: '非法的转发路径' }, { status: 400 });
  }

  const config = getConfig();
  const target = new URL(REST_BASE + path + url.search);
  target.searchParams.set('jscode', config.securityCode);
  target.searchParams.set('platform', 'JS');
  target.searchParams.set('s', 'rsv3');

  try {
    const upstream = await fetch(target, {
      method: 'GET',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'user-agent': 'BinaryOrbit/0.1' },
    });
    const body = await upstream.arrayBuffer();
    return new Response(body, {
      status: upstream.status,
      headers: {
        'content-type': upstream.headers.get('content-type') ?? 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    return Response.json(
      { status: '0', info: `转发高德服务失败：${(error as Error).message}`, infocode: 'PROXY_ERROR' },
      { status: 502 },
    );
  }
}
