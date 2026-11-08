export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function buildUrl(path: string, params?: Record<string, string | number | undefined | null>): string {
  if (!params) return path;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options?: { signal?: AbortSignal },
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: options?.signal,
    });
  } catch (error) {
    // 主动取消（比如地图连续移动时丢掉上一次逆地理）不算错误，原样抛出
    if ((error as Error)?.name === 'AbortError') throw error;
    throw new ApiError('连不上服务，请确认后端是否还在运行', 0);
  }

  const text = await response.text();
  const payload = text ? safeJson(text) : null;

  if (!response.ok) {
    const raw = payload && typeof payload === 'object' && 'error' in payload ? (payload as { error: unknown }).error : undefined;
    const message = raw === undefined ? `请求失败（HTTP ${response.status}）` : String(raw);
    throw new ApiError(message, response.status);
  }
  return payload as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function apiGet<T>(
  path: string,
  params?: Record<string, string | number | undefined | null>,
  options?: { signal?: AbortSignal },
): Promise<T> {
  return request<T>('GET', buildUrl(path, params), undefined, options);
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return request<T>('POST', path, body);
}

export function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return request<T>('PATCH', path, body);
}

export function apiDelete<T>(path: string): Promise<T> {
  return request<T>('DELETE', path);
}
