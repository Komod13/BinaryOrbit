import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MARKER_GAP, SPREAD_ZOOM, forcesSpread, spreadOffsets } from './markerLayout.ts';

const distance = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

test('最大层级和倒数第二层级强制不聚合，再往下仍然聚合', () => {
  assert.equal(forcesSpread(18), true);
  assert.equal(forcesSpread(17), true);
  assert.equal(forcesSpread(SPREAD_ZOOM), true);
  assert.equal(forcesSpread(16), false);
  assert.equal(forcesSpread(13), false);
});

test('完全重合的两个点被推开到不重叠', () => {
  const points = [
    { x: 100, y: 100 },
    { x: 100, y: 100 },
  ];
  const offsets = spreadOffsets(points);
  const first = { x: points[0].x + offsets[0].x, y: points[0].y + offsets[0].y };
  const second = { x: points[1].x + offsets[1].x, y: points[1].y + offsets[1].y };
  assert.ok(distance(first, second) >= MARKER_GAP - 0.5, `间距 ${distance(first, second)} 太小`);
  // 各退一半：两个点对称错开，不会整体漂移
  assert.ok(distance(first, second) < MARKER_GAP * 1.5);
});

test('挨得很近（商场里的两家店）的点被错开，且位移保持克制', () => {
  // zoom 18 下两家店可能只差 3 个像素
  const points = [
    { x: 0, y: 0 },
    { x: 3, y: 2 },
  ];
  const offsets = spreadOffsets(points);
  const first = { x: points[0].x + offsets[0].x, y: points[0].y + offsets[0].y };
  const second = { x: points[1].x + offsets[1].x, y: points[1].y + offsets[1].y };
  assert.ok(distance(first, second) >= MARKER_GAP - 0.5);
  assert.ok(Math.hypot(offsets[0].x, offsets[0].y) <= MARKER_GAP);
  assert.ok(Math.hypot(offsets[1].x, offsets[1].y) <= MARKER_GAP);
});

test('距离够远的点完全不动', () => {
  const points = [
    { x: 0, y: 0 },
    { x: 500, y: 500 },
  ];
  const offsets = spreadOffsets(points);
  assert.deepEqual(offsets, [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ]);
});

test('一堆重合的点全部互相分开', () => {
  const points = [
    { x: 200, y: 200 },
    { x: 200, y: 200 },
    { x: 200, y: 200 },
    { x: 200, y: 200 },
    { x: 200, y: 200 },
    { x: 200, y: 200 },
    { x: 200, y: 200 },
  ];
  const offsets = spreadOffsets(points);
  const placed = points.map((point, index) => ({
    x: point.x + offsets[index].x,
    y: point.y + offsets[index].y,
  }));
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      assert.ok(
        distance(placed[i], placed[j]) >= MARKER_GAP * 0.95,
        `第 ${i} 个和第 ${j} 个仍有重叠：${distance(placed[i], placed[j])}`,
      );
    }
  }
});

test('排布是确定性的：同样的输入重复算不会抖动', () => {
  const points = [
    { x: 10, y: 10 },
    { x: 12, y: 14 },
    { x: 8, y: 16 },
    { x: 10, y: 10 },
  ];
  assert.deepEqual(spreadOffsets(points), spreadOffsets(points));
});
