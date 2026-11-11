import { getDb } from './db.ts';
import { amapGet } from './amap.ts';

/** 4 个直辖市：城市口径一律归一到省级 adcode。 */
export const MUNICIPALITIES = ['110000', '120000', '310000', '500000'] as const;

/** 高德把直辖市的城区/郊县拆成伪城市，这些 adcode 都要折叠回省级。 */
const MUNICIPALITY_PSEUDO: Record<string, string> = {
  '110100': '110000',
  '120100': '120000',
  '310100': '310000',
  '500100': '500000',
  '500200': '500000',
};

/** 全国省级行政区（DataV 除台湾外都有边界；台湾在 geo.ts 里单独标注不可点亮）。 */
export const PROVINCES: { adcode: string; name: string }[] = [
  { adcode: '110000', name: '北京市' },
  { adcode: '120000', name: '天津市' },
  { adcode: '130000', name: '河北省' },
  { adcode: '140000', name: '山西省' },
  { adcode: '150000', name: '内蒙古自治区' },
  { adcode: '210000', name: '辽宁省' },
  { adcode: '220000', name: '吉林省' },
  { adcode: '230000', name: '黑龙江省' },
  { adcode: '310000', name: '上海市' },
  { adcode: '320000', name: '江苏省' },
  { adcode: '330000', name: '浙江省' },
  { adcode: '340000', name: '安徽省' },
  { adcode: '350000', name: '福建省' },
  { adcode: '360000', name: '江西省' },
  { adcode: '370000', name: '山东省' },
  { adcode: '410000', name: '河南省' },
  { adcode: '420000', name: '湖北省' },
  { adcode: '430000', name: '湖南省' },
  { adcode: '440000', name: '广东省' },
  { adcode: '450000', name: '广西壮族自治区' },
  { adcode: '460000', name: '海南省' },
  { adcode: '500000', name: '重庆市' },
  { adcode: '510000', name: '四川省' },
  { adcode: '520000', name: '贵州省' },
  { adcode: '530000', name: '云南省' },
  { adcode: '540000', name: '西藏自治区' },
  { adcode: '610000', name: '陕西省' },
  { adcode: '620000', name: '甘肃省' },
  { adcode: '630000', name: '青海省' },
  { adcode: '640000', name: '宁夏回族自治区' },
  { adcode: '650000', name: '新疆维吾尔自治区' },
  { adcode: '710000', name: '台湾省' },
  { adcode: '810000', name: '香港特别行政区' },
  { adcode: '820000', name: '澳门特别行政区' },
];

export const TAIWAN_ADCODE = '710000';

/**
 * 城市 adcode 归一化：直辖市的区/伪城市全部折叠到省级 adcode。
 * 其他省份原样返回（省直辖县级市保留自己的 adcode）。
 */
export function normalizeCityAdcode(adcode: string | null | undefined): string | null {
  if (!adcode) return null;
  const code = String(adcode).trim();
  if (!/^\d{6}$/.test(code)) return code || null;
  const pseudo = MUNICIPALITY_PSEUDO[code];
  if (pseudo) return pseudo;
  const province = `${code.slice(0, 2)}0000`;
  if ((MUNICIPALITIES as readonly string[]).includes(province)) return province;
  return code;
}

export function provinceNameOf(adcode: string): string | null {
  return PROVINCES.find((item) => item.adcode === adcode)?.name ?? null;
}

/** 从 /v3/config/district 同步一次城市字典（34 省 + 416 个二级单元）。 */
export async function syncCityDict(): Promise<number> {
  const body = (await amapGet('/v3/config/district', {
    keywords: '中国',
    subdistrict: 2,
    extensions: 'base',
  })) as { districts?: DistrictNode[] };

  const provinces = body.districts?.[0]?.districts ?? [];
  const db = getDb();
  const insert = db.prepare(
    'INSERT INTO city_dict (adcode, name, lng, lat) VALUES (?, ?, ?, ?) ' +
      'ON CONFLICT(adcode) DO UPDATE SET name=excluded.name, lng=excluded.lng, lat=excluded.lat',
  );

  let count = 0;
  const write = (adcode: string, name: unknown, center?: unknown) => {
    // AMap 的空 center 有时是 []、有时是 ""：都不能被 Number('') 当成 0,0
    const [lngText, latText] = (typeof center === 'string' ? center : '').split(',');
    const lng = lngText?.trim() ? Number(lngText) : Number.NaN;
    const lat = latText?.trim() ? Number(latText) : Number.NaN;
    const label = String(name ?? '').trim() || adcode;
    insert.run(adcode, label, Number.isFinite(lng) ? lng : null, Number.isFinite(lat) ? lat : null);
    count += 1;
  };

  for (const province of provinces) {
    if (!province.adcode) continue;
    write(province.adcode, province.name ?? province.adcode, province.center);
    for (const child of province.districts ?? []) {
      if (!child.adcode) continue;
      const adcode = normalizeCityAdcode(child.adcode) ?? child.adcode;
      // 直辖市伪城市折叠后名字用省级名字，避免出现「上海城区」
      const name =
        (MUNICIPALITIES as readonly string[]).includes(adcode) ? province.name ?? child.name : child.name;
      write(adcode, String(name ?? adcode), child.center);
    }
  }
  return count;
}

interface DistrictNode {
  adcode?: string;
  name?: string;
  center?: string;
  level?: string;
  districts?: DistrictNode[];
}

export interface CityDictRow {
  adcode: string;
  name: string;
  lng: number | null;
  lat: number | null;
}

export function cityDictCount(): number {
  const row = getDb().prepare('SELECT COUNT(*) AS c FROM city_dict').get() as { c: number };
  return row.c;
}

/** 「杭州市」→「杭州」：去掉常见行政后缀，再做前缀匹配。 */
const CITY_SUFFIX = /(市|地区|盟|自治州|特别行政区|省|自治区)$/u;

function bareCityName(raw: string): string {
  return raw.replace(CITY_SUFFIX, '');
}

/** 名称 → adcode。先精确匹配，再补「市/地区/自治州」等后缀的模糊匹配。 */
export function findCityByName(name: string | null | undefined): CityDictRow | null {
  const raw = (name ?? '').trim();
  if (!raw) return null;
  const db = getDb();
  const exact = db.prepare('SELECT adcode, name, lng, lat FROM city_dict WHERE name = ? LIMIT 1').get(raw) as
    | CityDictRow
    | undefined;
  if (exact) return exact;

  const bare = bareCityName(raw);
  if (!bare) return null;
  const like = db
    .prepare("SELECT adcode, name, lng, lat FROM city_dict WHERE name LIKE ? LIMIT 1")
    .get(`${bare}%`) as CityDictRow | undefined;
  return like ?? null;
}

/**
 * 批量把 POI 的 cityname 解析成字典行：只查一次库，避免搜索结果逐条查询（N+1）。
 * 返回的 Map 以上下文里的原始名称（去首尾空格后）为 key。
 */
export function findCitiesByNames(names: readonly (string | null | undefined)[]): Map<string, CityDictRow> {
  const wanted = new Set<string>();
  for (const name of names) {
    const raw = (name ?? '').trim();
    if (raw) wanted.add(raw);
  }

  const found = new Map<string, CityDictRow>();
  if (!wanted.size) return found;

  // city_dict 只有 400 多行，一次性读进内存比逐名称往返 SQLite 更划算
  const rows = getDb().prepare('SELECT adcode, name, lng, lat FROM city_dict').all() as unknown as CityDictRow[];
  for (const raw of wanted) {
    const exact = rows.find((row) => row.name === raw);
    if (exact) {
      found.set(raw, exact);
      continue;
    }
    const bare = bareCityName(raw);
    if (!bare) continue;
    const fuzzy = rows.find((row) => row.name.startsWith(bare));
    if (fuzzy) found.set(raw, fuzzy);
  }
  return found;
}

export function findCityByAdcode(adcode: string | null | undefined): CityDictRow | null {
  const code = normalizeCityAdcode(adcode);
  if (!code) return null;
  const row = getDb().prepare('SELECT adcode, name, lng, lat FROM city_dict WHERE adcode = ? LIMIT 1').get(code) as
    | CityDictRow
    | undefined;
  return row ?? null;
}

/** 省级名称（regeo 的 province 字段，如「上海市」）→ adcode。 */
export function findProvinceAdcode(provinceName: string | null | undefined): string | null {
  const name = (provinceName ?? '').trim();
  if (!name) return null;
  return PROVINCES.find((item) => item.name === name || item.name.startsWith(name))?.adcode ?? null;
}
