import { ref } from 'vue';
import type { Place } from './types.ts';

/**
 * 跨组件的地图聚焦请求。
 *
 * 统计浮窗挂在 App 里（两个页面共用），地图在 MapView 里，两者是兄弟节点；
 * 列表里点一条记录时用一个模块级 ref 搭桥，MapView 监听后平移地图。
 */
export interface MapFocusRequest {
  lng: number;
  lat: number;
  placeId: number;
  /** 自增序号：同一家店连点两次也能触发一次新的平移 */
  seq: number;
}

export const mapFocusRequest = ref<MapFocusRequest | null>(null);

export function requestMapFocus(place: Pick<Place, 'id' | 'lng' | 'lat'>): void {
  mapFocusRequest.value = {
    lng: place.lng,
    lat: place.lat,
    placeId: place.id,
    seq: (mapFocusRequest.value?.seq ?? 0) + 1,
  };
}

export function consumeMapFocus(): void {
  mapFocusRequest.value = null;
}
