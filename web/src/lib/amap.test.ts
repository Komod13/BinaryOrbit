import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveLabels } from './amap.ts';
import type { AppConfig } from './types.ts';

const base: AppConfig = {
  jsKey: 'key',
  serviceHost: '/_AMapService',
  priceTiers: { low: 60, high: 150 },
  mapLabels: 'auto',
  mapLabelMaxZoom: 12,
};

test('鼠标设备永远显示注记，.env 不生效', () => {
  assert.equal(resolveLabels({ ...base, mapLabels: 'off' }, '', false).mode, 'on');
  assert.equal(resolveLabels({ ...base, mapLabels: 'auto' }, '', false).mode, 'on');
  assert.equal(resolveLabels({ ...base, mapLabels: 'on' }, '', false).mode, 'on');
});

test('触屏设备跟随 .env 的 MAP_LABELS', () => {
  assert.equal(resolveLabels(base, '', true).mode, 'auto');
  assert.equal(resolveLabels({ ...base, mapLabels: 'off' }, '', true).mode, 'off');
  assert.equal(resolveLabels({ ...base, mapLabels: 'on' }, '', true).mode, 'on');
});

test('URL 参数优先级最高，任何设备都能覆盖（调试用）', () => {
  assert.equal(resolveLabels(base, '?labels=off', false).mode, 'off');
  assert.equal(resolveLabels(base, '?labels=auto', false).mode, 'auto');
  assert.equal(resolveLabels({ ...base, mapLabels: 'off' }, '?labels=on', true).mode, 'on');
  assert.equal(resolveLabels(base, '?labelzoom=15', true).maxZoom, 15);
});

test('labelzoom 非法时回落 .env 的 MAP_LABEL_MAX_ZOOM', () => {
  assert.equal(resolveLabels(base, '?labelzoom=abc', true).maxZoom, 12);
  assert.equal(resolveLabels(base, '?labelzoom=0', true).maxZoom, 12);
  assert.equal(resolveLabels({ ...base, mapLabelMaxZoom: 10 }, '', true).maxZoom, 10);
});

test('touch 标记原样透出，供 diag 展示', () => {
  assert.equal(resolveLabels(base, '', true).touch, true);
  assert.equal(resolveLabels(base, '', false).touch, false);
});
