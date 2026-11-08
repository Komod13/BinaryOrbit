import type { AppConfig, MapViewport } from './types.ts';

declare global {
  interface Window {
    AMap?: any;
    _AMapSecurityConfig?: { serviceHost: string };
  }
}

let loading: Promise<any> | null = null;

/** 注入 JSAPI 2.0 脚本，并把安全密钥的验证交给后端代理。 */
export function loadAMap(config: AppConfig): Promise<any> {
  if (window.AMap) return Promise.resolve(window.AMap);
  if (loading) return loading;

  loading = new Promise((resolve, reject) => {
    window._AMapSecurityConfig = { serviceHost: config.serviceHost };
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
    const url = `${config.serviceHost}/v3/ip?key=${encodeURIComponent(config.jsKey)}`;
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
