import { Hono } from 'hono';
import { getDb } from '../db.ts';
import { mapPois, searchAround, searchText } from '../amap.ts';
import { PLACE_TYPES, ValidationError, asNumber } from '../validate.ts';
import { findCitiesByNames, normalizeCityAdcode } from '../cities.ts';

interface ExistingRow {
  id: number;
  external_id: string;
}

export const searchRoute = new Hono();

searchRoute.get('/', async (c) => {
  const keyword = (c.req.query('keyword') ?? '').trim();
  // `?type=` 空值等同于没传
  const typeParam = (c.req.query('type') ?? '').trim() || undefined;
  if (typeParam && !(PLACE_TYPES as readonly string[]).includes(typeParam)) {
    throw new ValidationError('type 只能是 restaurant / spot');
  }
  const type = typeParam as 'restaurant' | 'spot' | undefined;

  let body: Record<string, unknown>;
  let mode: 'text' | 'around';

  if (keyword) {
    mode = 'text';
    const city = (c.req.query('city') ?? '').trim() || undefined;
    body = await searchText(keyword, type, city);
  } else {
    const rawLng = c.req.query('lng');
    const rawLat = c.req.query('lat');
    if (!rawLng?.trim() || !rawLat?.trim()) {
      throw new ValidationError('关键词搜索需要 keyword，周边搜索需要 lng 与 lat');
    }
    // 显式校验范围：Number('') 是 0，不能让空坐标变成几内亚湾
    const lng = asNumber(rawLng, '经度', -180, 180);
    const lat = asNumber(rawLat, '纬度', -90, 90);
    const radius = Math.min(5000, Math.max(100, Number(c.req.query('radius') ?? 1000) || 1000));
    mode = 'around';
    body = await searchAround(lng, lat, radius, type ?? 'restaurant');
  }

  const pois = mapPois(body);
  const dictByCityName = findCitiesByNames(pois.map((poi) => poi.cityName));
  const ids = pois.map((poi) => poi.id).filter(Boolean);
  const existing = new Map<string, number>();
  if (ids.length) {
    const placeholders = ids.map(() => '?').join(',');
    const rows = getDb()
      .prepare(`SELECT id, external_id FROM place WHERE external_id IN (${placeholders})`)
      .all(...ids) as unknown as ExistingRow[];
    for (const row of rows) existing.set(row.external_id, row.id);
  }

  const results = pois
    .filter((poi) => !type || poi.type === type)
    .map((poi) => {
      // cityname 去重后只查一次字典（之前每个 POI 一次 SELECT）
      const name = (poi.cityName ?? '').trim();
      const dict = name ? dictByCityName.get(name) : undefined;
      const cityAdcode = normalizeCityAdcode(dict?.adcode ?? null);
      return {
        ...poi,
        cityAdcode,
        existingPlaceId: existing.get(poi.id) ?? null,
      };
    });

  return c.json({ mode, results });
});
