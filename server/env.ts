import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

export interface Config {
  port: number;
  jsKey: string;
  securityCode: string;
  webKey: string;
  priceTiers: { low: number; high: number };
}

export const KEY_GUIDE = [
  'AMAP_JS_KEY        高德控制台 → 应用管理 → 我的应用 → 添加 Key（服务平台选「Web端(JS API)」）',
  'AMAP_SECURITY_CODE 同一应用的「安全密钥 jscode」（仅服务端使用，不进前端）',
  'AMAP_WEB_KEY       再添加一个 Key（服务平台选「Web服务」），用于 POI 检索 / 逆地理 / 行政区划',
];

/**
 * 读取 .env 并写入 process.env（只补缺失项，已存在的真实环境变量优先）。
 * 使用 Node 原生 parseEnv，与 --env-file 同一套解析规则。
 */
export function loadEnvFile(path = '.env'): void {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return;
  }
  const parsed = parseEnv(raw);
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

let cached: Config | null = null;

export function getConfig(): Config {
  if (cached) return cached;
  const port = Number(process.env.PORT ?? 8787);
  const low = Number(process.env.PRICE_TIER_LOW ?? 60);
  const high = Number(process.env.PRICE_TIER_HIGH ?? 150);
  cached = {
    port,
    jsKey: process.env.AMAP_JS_KEY ?? '',
    securityCode: process.env.AMAP_SECURITY_CODE ?? '',
    webKey: process.env.AMAP_WEB_KEY ?? '',
    priceTiers: { low, high },
  };
  return cached;
}

/** 启动自检：返回人类可读的问题列表，空数组代表配置可用。 */
export function validateConfig(config: Config): string[] {
  const problems: string[] = [];
  const missing = [
    ['AMAP_JS_KEY', config.jsKey],
    ['AMAP_SECURITY_CODE', config.securityCode],
    ['AMAP_WEB_KEY', config.webKey],
  ].filter(([, value]) => !(value as string).trim()) as [string, string][];

  if (missing.length) {
    problems.push(`.env 缺少配置项：${missing.map(([name]) => name).join('、')}`);
    for (const [name] of missing) {
      const guide = KEY_GUIDE.find((line) => line.startsWith(name));
      if (guide) problems.push(`  · ${guide}`);
    }
    problems.push('  参考 .env.example，把上面几项补齐后重新启动。');
  }

  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
    problems.push(`PORT 不是合法端口：${process.env.PORT ?? ''}（应为 1–65535 的整数）`);
  }
  if (!(config.priceTiers.low >= 0) || !(config.priceTiers.high > config.priceTiers.low)) {
    problems.push('PRICE_TIER_LOW / PRICE_TIER_HIGH 需满足 0 ≤ LOW < HIGH');
  }
  return problems;
}

/** 测试用：清掉缓存，让下次 getConfig 重新读环境变量。 */
export function resetConfigForTest(): void {
  cached = null;
}
