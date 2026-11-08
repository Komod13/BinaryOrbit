import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { getConfig, parseMapLabels, resetConfigForTest, validateConfig } from '../env.ts';

// validateConfig 也会校验高德 key，这里给占位值，只测地图注记相关配置
process.env.AMAP_JS_KEY = 'test';
process.env.AMAP_SECURITY_CODE = 'test';
process.env.AMAP_WEB_KEY = 'test';

afterEach(() => {
  delete process.env.MAP_LABELS;
  delete process.env.MAP_LABEL_MAX_ZOOM;
  resetConfigForTest();
});

test('MAP_LABELS 接受 auto / on / off 与常见的真假写法', () => {
  assert.equal(parseMapLabels(undefined), 'auto');
  assert.equal(parseMapLabels('auto'), 'auto');
  assert.equal(parseMapLabels(' ON '), 'on');
  assert.equal(parseMapLabels('off'), 'off');
  assert.equal(parseMapLabels('1'), 'on');
  assert.equal(parseMapLabels('0'), 'off');
  assert.equal(parseMapLabels('true'), 'on');
  assert.equal(parseMapLabels('false'), 'off');
  assert.equal(parseMapLabels('随便写的'), 'auto');
});

test('默认地图注记 auto + 12', () => {
  resetConfigForTest();
  const config = getConfig();
  assert.equal(config.mapLabels, 'auto');
  assert.equal(config.mapLabelMaxZoom, 12);
  assert.deepEqual(validateConfig(config), []);
});

test('MAP_LABELS / MAP_LABEL_MAX_ZOOM 从环境变量读取', () => {
  process.env.MAP_LABELS = 'off';
  process.env.MAP_LABEL_MAX_ZOOM = '15';
  resetConfigForTest();
  const config = getConfig();
  assert.equal(config.mapLabels, 'off');
  assert.equal(config.mapLabelMaxZoom, 15);
});

test('写错 MAP_LABELS 或越界的 zoom 会在启动自检里报出来', () => {
  process.env.MAP_LABELS = 'hide';
  process.env.MAP_LABEL_MAX_ZOOM = '99';
  resetConfigForTest();
  const problems = validateConfig(getConfig());
  assert.ok(problems.some((line) => line.includes('MAP_LABELS')));
  assert.ok(problems.some((line) => line.includes('MAP_LABEL_MAX_ZOOM')));
});
