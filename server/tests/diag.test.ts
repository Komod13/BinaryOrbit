import { test } from 'node:test';
import assert from 'node:assert/strict';
import { app, call } from './helpers.ts';

test('POST /api/diag 接收浏览器诊断并返回 ok', async () => {
  const response = await call<{ ok: boolean; at: string }>('/api/diag', {
    method: 'POST',
    body: { build: '2025-01-01 00:00', fps: 42, renderer: 'webgl', markers: 12 },
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.ok(response.body.at);
});

test('POST /api/diag 非法 JSON → 400', async () => {
  const response = await app.request('/api/diag', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{oops',
  });
  assert.equal(response.status, 400);
});

test('POST /api/diag 非对象 → 400', async () => {
  const response = await app.request('/api/diag', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '[1,2,3]',
  });
  assert.equal(response.status, 400);
});

test('POST /api/diag 超过 8KB → 400', async () => {
  const response = await app.request('/api/diag', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pad: 'x'.repeat(9000) }),
  });
  assert.equal(response.status, 400);
});
