import assert from 'node:assert/strict';

process.env.DB_PATH = ':memory:';
process.env.DATA_DIR = '/tmp/binaryorbit-test-data';
process.env.NO_OPEN = '1';

const { createApp } = await import('../index.ts');
const { closeDb, getDb } = await import('../db.ts');

export const app = createApp();

/** 每个用例前重置成一个干净的内存库。 */
export function resetDb(): void {
  closeDb();
  getDb();
}

export function dropDb(): void {
  closeDb();
}

export interface ApiResult<T> {
  status: number;
  body: T;
}

export async function call<T = Record<string, unknown>>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<ApiResult<T>> {
  const response = await app.request(path, {
    method: init?.method ?? 'GET',
    headers: init?.body === undefined ? undefined : { 'content-type': 'application/json' },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await response.text();
  const body = (text ? JSON.parse(text) : null) as T;
  return { status: response.status, body };
}

export function expectOk<T>(result: ApiResult<T>): T {
  assert.ok(
    result.status >= 200 && result.status < 300,
    `期望 2xx，实际 ${result.status}: ${JSON.stringify(result.body)}`,
  );
  return result.body;
}

export const placeFixture = (overrides: Record<string, unknown> = {}) => ({
  type: 'restaurant',
  name: '大壶春（四川中路）',
  externalId: 'B0FF001',
  address: '黄浦区四川中路 136 号',
  lng: 121.4873,
  lat: 31.2314,
  category: '餐饮服务;中餐厅;本帮菜',
  cityName: '上海市',
  cityAdcode: '310101',
  district: '黄浦区',
  date: '2026-05-02',
  rating: 5,
  priceTier: 'low',
  note: '皮薄汁多',
  ...overrides,
});
