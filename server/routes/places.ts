import { Hono } from 'hono';
import { getDb } from '../db.ts';
import {
  PLACE_TYPES,
  ValidationError,
  asDate,
  asEnum,
  asNumber,
  asPriceTier,
  asRating,
  asText,
} from '../validate.ts';
import { findCityByName, normalizeCityAdcode, provinceNameOf } from '../cities.ts';

export interface PlaceRow {
  id: number;
  type: 'restaurant' | 'spot';
  name: string;
  external_id: string | null;
  address: string | null;
  lng: number;
  lat: number;
  category: string | null;
  city_name: string | null;
  city_adcode: string | null;
  district: string | null;
  created_time: string;
  updated_time: string;
}

export interface VisitRow {
  id: number;
  place_id: number;
  visited_date: string;
  rating: number | null;
  price_tier: string | null;
  note: string | null;
  created_time: string;
}

type Row = PlaceRow & {
  visit_count?: number;
  last_visited_on?: string | null;
  last_rating?: number | null;
};

export function toPlace(row: Row) {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    externalId: row.external_id,
    address: row.address,
    lng: row.lng,
    lat: row.lat,
    category: row.category,
    cityName: row.city_name,
    cityAdcode: row.city_adcode,
    district: row.district,
    createdTime: row.created_time,
    updatedTime: row.updated_time,
    visitCount: row.visit_count ?? undefined,
    lastVisitedOn: row.last_visited_on ?? null,
    lastRating: row.last_rating ?? null,
  };
}

export function toVisit(row: VisitRow) {
  return {
    id: row.id,
    placeId: row.place_id,
    date: row.visited_date,
    rating: row.rating,
    priceTier: row.price_tier,
    note: row.note,
    createdTime: row.created_time,
  };
}

const LIST_SQL = `
  SELECT p.*,
    (SELECT COUNT(*) FROM visit v WHERE v.place_id = p.id) AS visit_count,
    (SELECT MAX(v.visited_date) FROM visit v WHERE v.place_id = p.id) AS last_visited_on,
    (SELECT v.rating FROM visit v WHERE v.place_id = p.id AND v.rating IS NOT NULL
      ORDER BY v.visited_date DESC, v.id DESC LIMIT 1) AS last_rating
  FROM place p
  WHERE (:type IS NULL OR p.type = :type)
  ORDER BY COALESCE(last_visited_on, '') DESC, p.id DESC
`;

export function listPlaces(type: string | null): ReturnType<typeof toPlace>[] {
  const rows = getDb().prepare(LIST_SQL).all({ type }) as unknown as Row[];
  return rows.map(toPlace);
}

export function getPlaceRow(id: number): PlaceRow | null {
  const row = getDb().prepare('SELECT * FROM place WHERE id = ?').get(id) as PlaceRow | undefined;
  return row ?? null;
}

function listVisits(placeId: number): VisitRow[] {
  return getDb()
    .prepare('SELECT * FROM visit WHERE place_id = ? ORDER BY visited_date DESC, id DESC')
    .all(placeId) as unknown as VisitRow[];
}

export function visitCount(placeId: number): number {
  const row = getDb().prepare('SELECT COUNT(*) AS c FROM visit WHERE place_id = ?').get(placeId) as { c: number };
  return row.c;
}

interface PlaceInput {
  type: 'restaurant' | 'spot';
  name: string;
  externalId: string | null;
  address: string | null;
  lng: number;
  lat: number;
  category: string | null;
  cityName: string | null;
  cityAdcode: string | null;
  district: string | null;
  date: string;
  rating: number | null;
  priceTier: string | null;
  note: string | null;
}

export function parsePlaceInput(body: Record<string, unknown>): PlaceInput {
  const type = asEnum(body.type, '类型', PLACE_TYPES);
  const name = asText(body.name, '名称', { required: true, max: 60 }) as string;
  const lng = asNumber(body.lng, '经度', -180, 180);
  const lat = asNumber(body.lat, '纬度', -90, 90);

  const rawCityName = asText(body.cityName, '城市', { max: 40 });
  const rawCityAdcode = asText(body.cityAdcode, '城市编码', { max: 12 });
  const dictRow = rawCityAdcode ? null : findCityByName(rawCityName);
  const cityAdcode = normalizeCityAdcode(rawCityAdcode ?? dictRow?.adcode ?? null);
  const cityName =
    (cityAdcode && provinceNameOf(cityAdcode)) ?? rawCityName ?? dictRow?.name ?? null;

  return {
    type,
    name,
    externalId: asText(body.externalId, '高德 POI id', { max: 64 }),
    address: asText(body.address, '地址', { max: 200 }),
    lng,
    lat,
    category: asText(body.category, '分类', { max: 120 }),
    cityName,
    cityAdcode,
    district: asText(body.district, '区县', { max: 60 }),
    date: asDate(body.date, '到访日期'),
    rating: asRating(body.rating),
    priceTier: asPriceTier(body.priceTier, type),
    note: asText(body.note, '备注', { max: 200 }),
  };
}

export function insertVisit(placeId: number, input: Pick<PlaceInput, 'date' | 'rating' | 'priceTier' | 'note'>): VisitRow {
  const db = getDb();
  const info = db
    .prepare(
      'INSERT INTO visit (place_id, visited_date, rating, price_tier, note) VALUES (?, ?, ?, ?, ?)',
    )
    .run(placeId, input.date, input.rating, input.priceTier, input.note);
  const row = db.prepare('SELECT * FROM visit WHERE id = ?').get(Number(info.lastInsertRowid)) as unknown as VisitRow;
  return row;
}

export function parseVisitInput(body: Record<string, unknown>, placeType: string) {
  return {
    date: asDate(body.date, '到访日期'),
    rating: asRating(body.rating),
    priceTier: asPriceTier(body.priceTier, placeType),
    note: asText(body.note, '备注', { max: 200 }),
  };
}

export const placesRoute = new Hono();

placesRoute.get('/', (c) => {
  const type = c.req.query('type') ?? null;
  if (type && !(PLACE_TYPES as readonly string[]).includes(type)) {
    throw new ValidationError('type 只能是 restaurant / spot');
  }
  return c.json({ places: listPlaces(type) });
});

placesRoute.get('/:id', (c) => {
  const id = Number(c.req.param('id'));
  const place = getPlaceRow(id);
  if (!place) return c.json({ error: '地点不存在' }, 404);
  const visits = listVisits(id);
  const lastRated = visits.find((visit) => visit.rating !== null);
  return c.json({
    place: toPlace({
      ...place,
      visit_count: visits.length,
      last_visited_on: visits[0]?.visited_date ?? null,
      last_rating: lastRated?.rating ?? null,
    }),
    visits: visits.map(toVisit),
  });
});

placesRoute.post('/', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const input = parsePlaceInput(body);
  const db = getDb();

  if (input.externalId) {
    const existing = db.prepare('SELECT * FROM place WHERE external_id = ?').get(input.externalId) as
      | PlaceRow
      | undefined;
    if (existing) {
      const visit = insertVisit(existing.id, input);
      return c.json({ place: toPlace(existing), visit: toVisit(visit), deduped: true }, 200);
    }
  }

  db.exec('BEGIN');
  try {
    const info = db
      .prepare(
        `INSERT INTO place (type, name, external_id, address, lng, lat, category, city_name, city_adcode, district)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.type,
        input.name,
        input.externalId,
        input.address,
        input.lng,
        input.lat,
        input.category,
        input.cityName,
        input.cityAdcode,
        input.district,
      );
    const placeId = Number(info.lastInsertRowid);
    const visit = insertVisit(placeId, input);
    db.exec('COMMIT');
    const place = getPlaceRow(placeId) as PlaceRow;
    return c.json({ place: toPlace(place), visit: toVisit(visit), deduped: false }, 201);
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
});

placesRoute.delete('/:id', (c) => {
  const id = Number(c.req.param('id'));
  const info = getDb().prepare('DELETE FROM place WHERE id = ?').run(id);
  if (!info.changes) return c.json({ error: '地点不存在' }, 404);
  return c.json({ ok: true });
});

placesRoute.post('/:id/visits', async (c) => {
  const id = Number(c.req.param('id'));
  const place = getPlaceRow(id);
  if (!place) return c.json({ error: '地点不存在' }, 404);
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const visit = insertVisit(id, parseVisitInput(body, place.type));
  return c.json({ place: toPlace(place), visit: toVisit(visit) }, 201);
});
