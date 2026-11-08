import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { call, dropDb, expectOk, placeFixture, resetDb } from './helpers.ts';
import { normalizeCityAdcode } from '../cities.ts';

beforeEach(() => resetDb());
process.on('exit', () => dropDb());

interface PlaceBody {
  place: { id: number; type: string; cityAdcode: string | null; visitCount?: number };
  visit: { id: number; date: string };
  deduped: boolean;
}

interface ListBody {
  places: { id: number; visitCount: number; lastVisitedOn: string | null; lastRating: number | null }[];
}

interface DetailBody {
  place: { id: number };
  visits: { id: number; date: string; rating: number | null }[];
}

test('1. 新建地点 + 首次到访成功，external_id 唯一', async () => {
  const created = expectOk(await call<PlaceBody>('/api/places', { method: 'POST', body: placeFixture() }));
  assert.equal(created.deduped, false);
  assert.ok(created.place.id > 0);
  assert.equal(created.place.type, 'restaurant');
  assert.equal(created.visit.date, '2026-05-02');

  const list = expectOk(await call<ListBody>('/api/places'));
  assert.equal(list.places.length, 1);
  assert.equal(list.places[0]?.visitCount, 1);
  assert.equal(list.places[0]?.lastVisitedOn, '2026-05-02');
  assert.equal(list.places[0]?.lastRating, 5);
});

test('2. 同一 external_id 再次提交 → 不新建地点，只追加到访', async () => {
  const first = expectOk(await call<PlaceBody>('/api/places', { method: 'POST', body: placeFixture() }));
  const again = expectOk(
    await call<PlaceBody>('/api/places', {
      method: 'POST',
      body: placeFixture({ date: '2026-06-01', rating: null, priceTier: null, name: '改个名字也不影响' }),
    }),
  );

  assert.equal(again.deduped, true);
  assert.equal(again.place.id, first.place.id);

  const list = expectOk(await call<ListBody>('/api/places'));
  assert.equal(list.places.length, 1);
  assert.equal(list.places[0]?.visitCount, 2);
  assert.equal(list.places[0]?.lastVisitedOn, '2026-06-01');
});

test('3. 手动点（external_id = null）可建多条，互不干扰', async () => {
  const a = expectOk(
    await call<PlaceBody>('/api/places', {
      method: 'POST',
      body: placeFixture({ externalId: null, name: '朋友家', type: 'spot', priceTier: null }),
    }),
  );
  const b = expectOk(
    await call<PlaceBody>('/api/places', {
      method: 'POST',
      body: placeFixture({ externalId: null, name: '路边摊', lng: 121.5, lat: 31.25 }),
    }),
  );
  assert.notEqual(a.place.id, b.place.id);

  const list = expectOk(await call<ListBody>('/api/places'));
  assert.equal(list.places.length, 2);
});

test('4. 删除单条到访 → 地点的到访次数随之变化', async () => {
  const created = expectOk(await call<PlaceBody>('/api/places', { method: 'POST', body: placeFixture() }));
  const extra = expectOk(
    await call<{ visit: { id: number } }>(`/api/places/${created.place.id}/visits`, {
      method: 'POST',
      body: { date: '2026-07-01', rating: 4, priceTier: 'mid' },
    }),
  );

  const removed = expectOk(
    await call<{ ok: boolean; placeDeleted: boolean }>(`/api/visits/${extra.visit.id}`, { method: 'DELETE' }),
  );
  assert.equal(removed.placeDeleted, false);

  const list = expectOk(await call<ListBody>('/api/places'));
  assert.equal(list.places[0]?.visitCount, 1);
  assert.equal(list.places[0]?.lastVisitedOn, '2026-05-02');
});

test('5. 删掉最后一条到访 → 连带删除地点', async () => {
  const created = expectOk(await call<PlaceBody>('/api/places', { method: 'POST', body: placeFixture() }));
  const removed = expectOk(
    await call<{ ok: boolean; placeDeleted: boolean }>(`/api/visits/${created.visit.id}`, { method: 'DELETE' }),
  );
  assert.equal(removed.placeDeleted, true);

  const list = expectOk(await call<ListBody>('/api/places'));
  assert.equal(list.places.length, 0);

  const detail = await call(`/api/places/${created.place.id}`);
  assert.equal(detail.status, 404);
});

test('6. 删除地点会级联删掉它的到访记录', async () => {
  const created = expectOk(await call<PlaceBody>('/api/places', { method: 'POST', body: placeFixture() }));
  expectOk(
    await call(`/api/places/${created.place.id}/visits`, {
      method: 'POST',
      body: { date: '2026-08-08', rating: 3 },
    }),
  );

  expectOk(await call(`/api/places/${created.place.id}`, { method: 'DELETE' }));
  assert.equal((await call(`/api/places/${created.place.id}`)).status, 404);

  const detail = expectOk(await call<DetailBody>('/api/places')) as unknown as ListBody;
  assert.equal(detail.places.length, 0);
});

test('7. 城市口径 = place.city_adcode ∪ city_manual，直辖市归一化', async () => {
  // 落库时 310101（黄浦区）要折叠成 310000
  const created = expectOk(await call<PlaceBody>('/api/places', { method: 'POST', body: placeFixture() }));
  assert.equal(created.place.cityAdcode, '310000');
  assert.equal(normalizeCityAdcode('110105'), '110000');
  assert.equal(normalizeCityAdcode('500200'), '500000');
  assert.equal(normalizeCityAdcode('440104'), '440104'); // 普通地级市的区不折叠
  assert.equal(normalizeCityAdcode('429004'), '429004'); // 省直辖县级市保留

  // 手动补标一个没有地点的城市
  expectOk(
    await call('/api/cities/manual', { method: 'POST', body: { adcode: '320100', name: '南京市' } }),
  );

  const cities = expectOk(await call<{ cities: { adcode: string; restaurantCount: number; manual: boolean }[] }>(
    '/api/cities',
  ));
  assert.equal(cities.cities.length, 2);
  const adcodes = cities.cities.map((city) => city.adcode).sort();
  assert.deepEqual(adcodes, ['310000', '320100']);
  assert.equal(cities.cities.find((city) => city.adcode === '310000')?.restaurantCount, 1);
  assert.equal(cities.cities.find((city) => city.adcode === '320100')?.manual, true);

  // 取消补标后城市数回到 1
  expectOk(await call('/api/cities/manual?adcode=320100', { method: 'DELETE' }));
  const after = expectOk(await call<{ cities: unknown[] }>('/api/cities'));
  assert.equal(after.cities.length, 1);
});

test('8. /api/stats 三个数字口径正确（同一家店多次到访只算一家）', async () => {
  const shop = expectOk(await call<PlaceBody>('/api/places', { method: 'POST', body: placeFixture() }));
  expectOk(
    await call(`/api/places/${shop.place.id}/visits`, {
      method: 'POST',
      body: { date: '2026-09-09', rating: 4 },
    }),
  );
  expectOk(
    await call('/api/places', {
      method: 'POST',
      body: placeFixture({ externalId: null, type: 'spot', name: '外滩', priceTier: null }),
    }),
  );
  expectOk(await call('/api/cities/manual', { method: 'POST', body: { adcode: '330100', name: '杭州市' } }));

  const stats = expectOk(await call<{ restaurant: number; spot: number; city: number }>('/api/stats'));
  assert.deepEqual(stats, { restaurant: 1, spot: 1, city: 2 });
});
