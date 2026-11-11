import { Hono } from 'hono';
import { getDb } from '../db.ts';
import { findCityByAdcode, normalizeCityAdcode, provinceNameOf } from '../cities.ts';
import { ValidationError, asText } from '../validate.ts';
import { allCachedFeatures, geoStatus, warmBoundaries } from '../geo.ts';

interface CityRow {
  adcode: string;
  manual_name: string | null;
  dict_name: string | null;
  lng: number | null;
  lat: number | null;
  restaurant_count: number;
  spot_count: number;
  first_visited_on: string | null;
  last_visited_on: string | null;
  manual: number;
}

const CITIES_SQL = `
  WITH visited AS (
    SELECT city_adcode AS adcode FROM place WHERE city_adcode IS NOT NULL GROUP BY city_adcode
    UNION
    SELECT adcode FROM city_manual
  )
  SELECT
    v.adcode AS adcode,
    (SELECT name FROM city_manual m WHERE m.adcode = v.adcode) AS manual_name,
    (SELECT name FROM city_dict d WHERE d.adcode = v.adcode) AS dict_name,
    (SELECT lng FROM city_dict d WHERE d.adcode = v.adcode) AS lng,
    (SELECT lat FROM city_dict d WHERE d.adcode = v.adcode) AS lat,
    (SELECT COUNT(*) FROM place p WHERE p.city_adcode = v.adcode AND p.type = 'restaurant') AS restaurant_count,
    (SELECT COUNT(*) FROM place p WHERE p.city_adcode = v.adcode AND p.type = 'spot') AS spot_count,
    (SELECT MIN(vi.visited_date) FROM visit vi JOIN place p ON p.id = vi.place_id
      WHERE p.city_adcode = v.adcode) AS first_visited_on,
    (SELECT MAX(vi.visited_date) FROM visit vi JOIN place p ON p.id = vi.place_id
      WHERE p.city_adcode = v.adcode) AS last_visited_on,
    EXISTS(SELECT 1 FROM city_manual m WHERE m.adcode = v.adcode) AS manual
  FROM visited v
`;

export function listCities() {
  const rows = getDb().prepare(CITIES_SQL).all() as unknown as CityRow[];
  return rows
    .map((row) => {
      const name =
        row.manual_name ??
        row.dict_name ??
        provinceNameOf(row.adcode) ??
        row.adcode;
      return {
        adcode: row.adcode,
        name,
        lng: row.lng,
        lat: row.lat,
        restaurantCount: row.restaurant_count,
        spotCount: row.spot_count,
        firstVisitedOn: row.first_visited_on,
        lastVisitedOn: row.last_visited_on,
        manual: Boolean(row.manual),
      };
    })
    .sort((a, b) => String(b.lastVisitedOn ?? '').localeCompare(String(a.lastVisitedOn ?? '')));
}

export const citiesRoute = new Hono();

citiesRoute.get('/', (c) => c.json({ cities: listCities() }));

citiesRoute.get('/geo', (c) => {
  warmBoundaries();
  const status = geoStatus();
  // 客户端把已经拿到的省份传回来，只下发新增的部分（首次为空 = 全量）
  const known = new Set(
    (c.req.query('loaded') ?? '')
      .split(',')
      .map((code) => code.trim())
      .filter((code) => /^\d{6}$/.test(code)),
  );
  const features = allCachedFeatures().filter((feature) => !known.has(feature.properties.province));
  return c.json({
    total: status.total,
    loaded: status.loaded,
    missing: status.missing,
    unsupported: status.unsupported,
    geojson: { type: 'FeatureCollection', features },
  });
});

citiesRoute.post('/manual', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const rawAdcode = asText(body.adcode, '城市编码', { required: true, max: 12 }) as string;
  const adcode = normalizeCityAdcode(rawAdcode) as string;
  if (!/^\d{6}$/.test(adcode)) throw new ValidationError('城市编码应为 6 位数字');

  const name =
    asText(body.name, '城市名', { max: 40 }) ??
    findCityByAdcode(adcode)?.name ??
    provinceNameOf(adcode) ??
    adcode;

  getDb()
    .prepare(
      'INSERT INTO city_manual (adcode, name) VALUES (?, ?) ' +
        'ON CONFLICT(adcode) DO UPDATE SET name = excluded.name',
    )
    .run(adcode, name);
  return c.json({ ok: true, city: { adcode, name } }, 201);
});

citiesRoute.delete('/manual', (c) => {
  const adcode = normalizeCityAdcode(c.req.query('adcode'));
  if (!adcode) throw new ValidationError('缺少 adcode 参数');
  const info = getDb().prepare('DELETE FROM city_manual WHERE adcode = ?').run(adcode);
  return c.json({ ok: true, removed: info.changes > 0 });
});
