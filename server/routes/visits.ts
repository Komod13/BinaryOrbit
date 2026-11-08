import { Hono } from 'hono';
import { getDb } from '../db.ts';
import { visitCount } from './places.ts';

export const visitsRoute = new Hono();

visitsRoute.delete('/:id', (c) => {
  const id = Number(c.req.param('id'));
  const db = getDb();
  const row = db.prepare('SELECT * FROM visit WHERE id = ?').get(id) as { place_id: number } | undefined;
  if (!row) return c.json({ error: '到访记录不存在' }, 404);

  db.prepare('DELETE FROM visit WHERE id = ?').run(id);

  // README §2.1 #26：删掉最后一条到访 = 连带删除该地点
  let placeDeleted = false;
  if (visitCount(row.place_id) === 0) {
    db.prepare('DELETE FROM place WHERE id = ?').run(row.place_id);
    placeDeleted = true;
  }
  return c.json({ ok: true, placeDeleted });
});
