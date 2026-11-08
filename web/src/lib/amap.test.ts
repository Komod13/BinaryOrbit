import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTouchEnvironment, resolveLabels } from './amap.ts';
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

test('isTouchEnvironment：按平台判定，带触屏的 PC 仍算桌面', () => {
  const win = { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120', platform: 'Win32', maxTouchPoints: 10 };
  assert.equal(isTouchEnvironment(win), false, '触屏笔记本/台式机');

  const mac = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15', platform: 'MacIntel', maxTouchPoints: 0 };
  assert.equal(isTouchEnvironment(mac), false);

  const iPadDesktopMode = {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 CriOS/157',
    platform: 'MacIntel',
    maxTouchPoints: 5,
  };
  assert.equal(isTouchEnvironment(iPadDesktopMode), true, 'iPadOS 桌面模式');

  const ipad = { userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)', platform: 'iPad', maxTouchPoints: 5 };
  assert.equal(isTouchEnvironment(ipad), true);

  const iphone = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', platform: 'iPhone', maxTouchPoints: 5 };
  assert.equal(isTouchEnvironment(iphone), true);

  const android = { userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-X710)', platform: 'Linux armv8l', maxTouchPoints: 5 };
  assert.equal(isTouchEnvironment(android), true);
});

test('source 标出 mode 的来源：url / env / pc', () => {
  assert.equal(resolveLabels(base, '', false).source, 'pc');
  assert.equal(resolveLabels({ ...base, mapLabels: 'off' }, '', false).source, 'pc');
  assert.equal(resolveLabels(base, '', true).source, 'env');
  assert.equal(resolveLabels(base, '?labels=off', true).source, 'url');
});
