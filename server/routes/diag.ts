import { Hono } from 'hono';
import { ValidationError } from '../validate.ts';

export const diagRoute = new Hono();

const MAX_BYTES = 8192;

/**
 * 手机端自检面板（`?debug=1`）上报的数据。
 * iPad 上开不了 DevTools，就把一组采样打到启动服务的这个控制台里，
 * 在电脑上直接看「帧率 / 长任务 / 地图重绘 / 标记数量 / 构建时间」。
 */
diagRoute.post('/', async (c) => {
  const raw = await c.req.text();
  if (raw.length > MAX_BYTES) throw new ValidationError('诊断数据过大');
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new ValidationError('诊断数据不是合法 JSON');
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ValidationError('诊断数据应为对象');
  }

  const agent = (c.req.header('user-agent') ?? '').slice(0, 120);
  console.log('');
  console.log('  [diag] 收到浏览器端诊断');
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    const text = value === null || typeof value === 'object' ? JSON.stringify(value) : String(value);
    console.log(`         ${key.padEnd(16)} ${text.slice(0, 200)}`);
  }
  console.log(`         ${'user-agent'.padEnd(16)} ${agent}`);
  console.log('');

  return c.json({ ok: true, at: new Date().toISOString() });
});
