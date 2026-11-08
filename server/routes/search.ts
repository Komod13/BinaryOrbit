import { Hono } from 'hono';
import { getDb } from '../db.ts';
import { mapPois, searchAround, searchText } from '../amap.ts';
import { PLACE_TYPES, ValidationError } from '../validate.ts';
import { findCityByName, normalizeCityAdcode } from '../cities.ts';

interface ExistingRow {
  id: number;
  external_id: string;
}

export const searchRoute = new Hono();

searchRoute.get('/', async (c) => {
  const keyword = (c.req.query('keyword') ?? '').trim();
  const typeParam = c.req.query('type');
  if (typeParam && !(PLACE_TYPES as readonly string[]).includes(typeParam)) {
    throw new ValidationError('type 只能是 restaurant / spot');
  }
  const type = (typeParam ?? undefined) as 'restaurant' | 'spot' | undefined;

  let body: Record<string, unknown>;
  let mode: 'text' | 'around';

  if (keyword) {
    mode = 'text';
    const city = (c.req.query('city') ?? '').trim() || undefined;
    body = await searchText(keyword, type, city);
  } else {
    const lng = Number(c.req.query('lng'));
    const lat = Number(c.req.query('lat'));
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
      throw new ValidationError('关键词搜索需要 keyword，周边搜索需要 lng 与 lat');
    }
    const radius = Math.min(5000, Math.max(100, Number(c.req.query('radius') ?? 1000) || 1000));
    mode = 'around';
    body = await searchAround(lng, lat, radius, type ?? 'restaurant');
  }

  const pois = mapPois(body);
  const ids = pois.map((poi) => poi.id).filter(Boolean);
  const existing = new Map<string, number>();
  if (ids.length) {
    const placeholders = ids.map(() => '?').join(',');
    const rows = getDb()
      .prepare(`SELECT id, external_id FROM place WHERE external_id IN (${placeholders})`)
      .all(...ids) as ExistingRow[];
    for (const row of rows) existing.set(row.external_id, row.id);
  }

  const results = pois
    .filter((poi) => !type || poi.type === type)
    .map((poi) => {
      const dict = findCityByName(poi.cityName);
      const cityAdcode = normalizeCityAdcode(dict?.adcode ?? null);
      return {
        ...poi,
        cityAdcode,
        existingPlaceId: existing.get(poi.id) ?? null,
      };
    });

  return c.json({ mode, results });
});
