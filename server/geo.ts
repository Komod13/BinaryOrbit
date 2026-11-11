import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { MUNICIPALITIES, PROVINCES, TAIWAN_ADCODE } from './cities.ts';

export interface GeoFeature {
  type: 'Feature';
  properties: { adcode: string; name: string; province: string; level: 'city' };
  geometry: unknown;
}

interface RawFeature {
  properties?: Record<string, unknown>;
  geometry?: unknown;
}

const DATAV = 'https://geo.datav.aliyun.com/areas_v3/bound';
const CONCURRENCY = 4;

/** 直辖市与港澳：DataV 的 `_full` 只给区县，因此改用省级整体轮廓作为一个「城市」。 */
const SINGLE_UNIT = new Set<string>([...MUNICIPALITIES, '810000', '820000']);

function geoDir(): string {
  return join(process.env.DATA_DIR ?? 'data', 'geo');
}

function cacheFile(adcode: string): string {
  return join(geoDir(), `${adcode}.json`);
}

const memory = new Map<string, GeoFeature[]>();
const inflight = new Map<string, Promise<void>>();
const warmStarted = new Set<string>();

/** 台湾没有 DataV 边界数据，不参与绘制与点亮。 */
export function supportedProvinces(): { adcode: string; name: string }[] {
  return PROVINCES.filter((item) => item.adcode !== TAIWAN_ADCODE);
}

function isMunicipality(adcode: string): boolean {
  return SINGLE_UNIT.has(adcode);
}

function readCache(adcode: string): GeoFeature[] | null {
  const cached = memory.get(adcode);
  if (cached) return cached;
  const file = cacheFile(adcode);
  if (!existsSync(file)) return null;
  try {
    const features = JSON.parse(readFileSync(file, 'utf8')) as GeoFeature[];
    memory.set(adcode, features);
    return features;
  } catch {
    return null;
  }
}

function normalize(adcode: string, name: string, raw: RawFeature[]): GeoFeature[] {
  const out: GeoFeature[] = [];
  for (const feature of raw) {
    const properties = feature.properties ?? {};
    const featureAdcode = String(properties.adcode ?? '');
    const featureName = String(properties.name ?? '');
    if (!feature.geometry) continue;

    if (isMunicipality(adcode)) {
      // 直辖市：只用省级整体轮廓，忽略区县要素
      if (featureAdcode !== adcode) continue;
      out.push({
        type: 'Feature',
        properties: { adcode, name: name, province: adcode, level: 'city' },
        geometry: feature.geometry,
      });
      continue;
    }

    // 其余省份：只留 level=city（含省直辖县级市、海南各县）
    if (String(properties.level ?? '') !== 'city') continue;
    out.push({
      type: 'Feature',
      properties: { adcode: featureAdcode, name: featureName, province: adcode, level: 'city' },
      geometry: feature.geometry,
    });
  }
  return out;
}

async function fetchProvince(adcode: string, name: string): Promise<void> {
  const url = isMunicipality(adcode) ? `${DATAV}/${adcode}.json` : `${DATAV}/${adcode}_full.json`;
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = (await response.json()) as { features?: RawFeature[] };
  const features = normalize(adcode, name, body.features ?? []);
  if (!features.length) throw new Error('边界数据为空');
  mkdirSync(geoDir(), { recursive: true });
  writeFileSync(cacheFile(adcode), JSON.stringify(features));
  memory.set(adcode, features);
}

export function ensureProvince(adcode: string): Promise<void> {
  if (readCache(adcode)) return Promise.resolve();
  const running = inflight.get(adcode);
  if (running) return running;
  const name = PROVINCES.find((item) => item.adcode === adcode)?.name ?? adcode;
  const task = fetchProvince(adcode, name)
    .catch((error) => {
      // 失败后允许下次调用重试，避免一次网络抖动就永久留空
      warmStarted.delete(adcode);
      console.warn(`[geo] 下载 ${adcode} 边界失败：${(error as Error).message}`);
    })
    .finally(() => {
      inflight.delete(adcode);
    });
  inflight.set(adcode, task);
  return task;
}

/** 后台补齐全国边界，并发 4；重复调用不会重复下载。 */
export function warmBoundaries(): void {
  const pending = supportedProvinces().filter((item) => !readCache(item.adcode) && !warmStarted.has(item.adcode));
  if (!pending.length) return;
  for (const item of pending) warmStarted.add(item.adcode);

  let index = 0;
  const worker = async () => {
    while (index < pending.length) {
      const item = pending[index++];
      if (!item) return;
      await ensureProvince(item.adcode);
    }
  };
  for (let i = 0; i < CONCURRENCY; i++) void worker();
}

export interface GeoStatus {
  total: number;
  loaded: string[];
  missing: string[];
  unsupported: string[];
}

export function geoStatus(): GeoStatus {
  const loaded: string[] = [];
  const missing: string[] = [];
  for (const item of supportedProvinces()) {
    if (readCache(item.adcode)) loaded.push(item.adcode);
    else missing.push(item.adcode);
  }
  return { total: supportedProvinces().length, loaded, missing, unsupported: [TAIWAN_ADCODE] };
}

export function allCachedFeatures(): GeoFeature[] {
  const features: GeoFeature[] = [];
  for (const item of supportedProvinces()) {
    const cached = readCache(item.adcode);
    if (cached) features.push(...cached);
  }
  return features;
}

/** 测试/维护用：清空内存缓存（不动磁盘文件）。 */
export function clearGeoMemory(): void {
  memory.clear();
}
