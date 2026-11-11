import { test } from 'node:test';
import assert from 'node:assert/strict';
import { asDate, asNumber } from '../validate.ts';

test('asNumber：缺省值 / 空字符串不能被当成 0', () => {
  assert.throws(() => asNumber(undefined, '经度', -180, 180), /经度必须是数字/);
  assert.throws(() => asNumber(null, '经度', -180, 180), /经度必须是数字/);
  assert.throws(() => asNumber('', '经度', -180, 180), /经度必须是数字/);
  assert.throws(() => asNumber('   ', '经度', -180, 180), /经度必须是数字/);
  assert.throws(() => asNumber('abc', '经度', -180, 180), /经度必须是数字/);
});

test('asNumber：合法数字照常通过，0 也是合法值', () => {
  assert.equal(asNumber('121.5', '经度', -180, 180), 121.5);
  assert.equal(asNumber(0, '经度', -180, 180), 0);
  assert.throws(() => asNumber(200, '经度', -180, 180), /需在 -180–180 之间/);
});

test('asDate：不存在的日期不能靠 Date 自动滚到下个月', () => {
  assert.equal(asDate('2026-02-28'), '2026-02-28');
  assert.throws(() => asDate('2026-02-31'), /不是有效日期/);
  assert.throws(() => asDate('2026-13-01'), /不是有效日期/);
  assert.throws(() => asDate('2026-2-3'), /格式应为 YYYY-MM-DD/);
});
