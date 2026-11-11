import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_PATH = ':memory:';
process.env.DATA_DIR = '/tmp/binaryorbit-test-data';

const { closeDb, getDb } = await import('../db.ts');
const { findCitiesByNames, findCityByName } = await import('../cities.ts');

beforeEach(() => {
  closeDb();
  const db = getDb();
  const insert = db.prepare('INSERT INTO city_dict (adcode, name, lng, lat) VALUES (?, ?, ?, ?)');
  insert.run('330100', '杭州市', 120.1551, 30.2741);
  insert.run('310000', '上海市', 121.4737, 31.2304);
});

after(() => closeDb());

test('findCitiesByNames：一次查询解析多个城市名，空值与重复名不产生多余结果', () => {
  const found = findCitiesByNames(['杭州市', '上海', '', null, '杭州市', '不存在']);
  assert.equal(found.size, 2);
  assert.equal(found.get('杭州市')?.adcode, '330100');
  // 「上海」没有精确命中，按后缀去掉后的前缀匹配到「上海市」
  assert.equal(found.get('上海')?.adcode, '310000');
  assert.equal(found.has(''), false);
  assert.equal(found.has('不存在'), false);
});

test('findCityByName 与批量版本保持同一套精确 / 前缀匹配规则', () => {
  assert.equal(findCityByName('杭州市')?.adcode, '330100');
  assert.equal(findCityByName('杭州')?.adcode, '330100');
  assert.equal(findCityByName('  上海市  ')?.adcode, '310000');
  assert.equal(findCityByName('不存在'), null);
});
