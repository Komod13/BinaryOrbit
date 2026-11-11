import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapPois } from '../amap.ts';

const poi = {
  id: 'B0FF001',
  name: '大壶春',
  typecode: '050100',
  type: '餐饮服务;中餐厅;本帮菜',
  location: '121.4873,31.2314',
  address: '四川中路 136 号',
  cityname: '上海市',
  adname: '黄浦区',
  pname: '上海市',
};

test('文本检索没有 distance 字段时返回 null，而不是 0', () => {
  const [row] = mapPois({ pois: [poi] });
  assert.ok(row);
  assert.equal(row.distance, null);
});

test('周边检索返回的 distance 原样保留', () => {
  const [row] = mapPois({ pois: [{ ...poi, distance: '123' }] });
  assert.ok(row);
  assert.equal(row.distance, 123);
});
