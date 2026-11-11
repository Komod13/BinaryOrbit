import { test } from 'node:test';
import assert from 'node:assert/strict';
import { consumeMapFocus, mapFocusRequest, requestMapFocus } from './mapFocus.ts';

test('选中列表记录时带上坐标，并用自增序号保证连点也能触发', () => {
  consumeMapFocus();
  requestMapFocus({ id: 1, lng: 120.2115, lat: 30.2085 });
  assert.deepEqual(mapFocusRequest.value, { lng: 120.2115, lat: 30.2085, placeId: 1, seq: 1 });

  requestMapFocus({ id: 1, lng: 120.2115, lat: 30.2085 });
  assert.deepEqual(mapFocusRequest.value, { lng: 120.2115, lat: 30.2085, placeId: 1, seq: 2 });

  consumeMapFocus();
  assert.deepEqual(mapFocusRequest.value, null);

  requestMapFocus({ id: 2, lng: 121, lat: 31 });
  assert.deepEqual(mapFocusRequest.value, { lng: 121, lat: 31, placeId: 2, seq: 1 });
  consumeMapFocus();
});
