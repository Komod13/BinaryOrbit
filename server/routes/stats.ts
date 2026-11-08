import { Hono } from 'hono';
import { getDb } from '../db.ts';

export const statsRoute = new Hono();

interface CountRow {
  restaurant: number;
  spot: number;
}

statsRoute.get('/', (c) => {
  const db = getDb();
  const counts = db
    .prepare(
      `SELECT
        SUM(CASE WHEN type = 'restaurant' THEN 1 ELSE 0 END) AS restaurant,
        SUM(CASE WHEN type = 'spot' THEN 1 ELSE 0 END) AS spot
      FROM place`,
    )
    .get() as CountRow | undefined;

  const city = db
    .prepare(
      `SELECT COUNT(*) AS city FROM (
        SELECT city_adcode AS adcode FROM place WHERE city_adcode IS NOT NULL
        UNION
        SELECT adcode FROM city_manual
      )`,
    )
    .get() as { city: number };

  return c.json({
    restaurant: Number(counts?.restaurant ?? 0),
    spot: Number(counts?.spot ?? 0),
    city: Number(city.city ?? 0),
  });
});
