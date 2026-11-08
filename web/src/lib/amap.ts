import type { AppConfig, MapViewport } from './types.ts';

declare global {
  interface Window {
    AMap?: any;
    _AMapSecurityConfig?: { serviceHost: string };
  }
}

let loading: Promise<any> | null = null;

/**
 * serviceHost 统一补成绝对地址。
 * 高德 SDK 内部用 `serviceHost.replace(/https?:\/\/\S+?\//, '').split('/')[0]` 取首段，
 * 再和 "_AMapService" 比对；裸路径 '/_AMapService' 取到的是空串，于是会打印
 * 「使用 JSAPI 安全模式，代理服务请以 _AMapService 作为一级路由」（localhost 下甚至是 window.alert）。
 * 传 `http://<origin>/_AMapService` 首段就是 `_AMapService`，检查通过，静默。
 */
function absoluteServiceHost(config: AppConfig): string {
  return new URL(config.serviceHost, window.location.origin).href.replace(/\/+$/, '');
}

/** 底图文字注记策略。auto = 低 zoom 显示城市/省名、高 zoom 隐藏。 */
export type LabelsMode = 'auto' | 'on' | 'off';

export interface LabelSettings {
  mode: LabelsMode;
  /** auto 模式下注记显示的 zoom 上限（低于它才显示） */
  maxZoom: number;
}

/**
 * 注记策略：`.env` 的 `MAP_LABELS` / `MAP_LABEL_MAX_ZOOM` 打底，URL 参数可临时覆盖（调试用）：
 * `?labels=1|0|auto`、`?labelzoom=13`。
 */
export function resolveLabels(config: AppConfig, search = window.location.search): LabelSettings {
  const params = new URLSearchParams(search);
  const raw = params.get('labels');
  // `.env` 的 auto 只对触屏生效（触屏走 WebGL 矢量注记，高 zoom 会把主线程占满）；
  // 鼠标设备没有这个负担，按 on 处理，桌面行为和以前一致。
  const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(any-pointer: coarse)').matches;
  const envMode: LabelsMode = config.mapLabels === 'auto' && !coarse ? 'on' : config.mapLabels;
  // URL 参数用于调试，显式写 auto 就任何设备都按 zoom 分级
  const mode: LabelsMode =
    raw === '1' ? 'on' : raw === '0' || raw === 'off' ? 'off' : raw === 'auto' ? 'auto' : envMode;
  const zoomOverride = Number(params.get('labelzoom'));
  const maxZoom = Number.isFinite(zoomOverride) && zoomOverride > 0 ? zoomOverride : config.mapLabelMaxZoom;
  return { mode, maxZoom };
}

/** 注入 JSAPI 2.0 脚本，并把安全密钥的验证交给后端代理。 */
export function loadAMap(config: AppConfig): Promise<any> {
  if (window.AMap) return Promise.resolve(window.AMap);
  if (loading) return loading;

  loading = new Promise((resolve, reject) => {
    window._AMapSecurityConfig = { serviceHost: absoluteServiceHost(config) };
    const script = document.createElement('script');
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(config.jsKey)}&plugin=AMap.GeoJSON`;
    script.async = true;
    script.onload = () => {
      if (window.AMap) resolve(window.AMap);
      else reject(new Error('高德地图脚本加载完成，但 AMap 未就绪'));
    };
    script.onerror = () => {
      loading = null;
      script.remove();
      reject(new Error('高德地图脚本加载失败：请检查网络，或确认 Key 的域名白名单为空'));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/**
 * 空库首次进入时用 IP 定位省份，取 /v3/ip 返回的 rectangle 中心。
 * 走同一套代理，不额外暴露 Web 服务 key。
 */
export async function viewportFromIp(config: AppConfig): Promise<MapViewport | null> {
  try {
    const url = `${absoluteServiceHost(config)}/v3/ip?key=${encodeURIComponent(config.jsKey)}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!response.ok) return null;
    const body = (await response.json()) as { status?: string; rectangle?: string };
    if (body.status !== '1' || !body.rectangle) return null;
    const [first, second] = body.rectangle.split(';');
    if (!first || !second) return null;
    const [lng1, lat1] = first.split(',').map(Number);
    const [lng2, lat2] = second.split(',').map(Number);
    if (![lng1, lat1, lng2, lat2].every((value) => Number.isFinite(value))) return null;
    return { lng: (lng1 + lng2) / 2, lat: (lat1 + lat2) / 2, zoom: 7 };
  } catch {
    return null;
  }
}

export const CHINA_VIEW: MapViewport = { lng: 104.19, lat: 35.86, zoom: 4 };
