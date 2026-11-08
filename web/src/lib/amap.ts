import type { AppConfig, MapViewport } from './types.ts';

declare global {
  interface Window {
    AMap?: any;
    _AMapSecurityConfig?: { serviceHost: string };
    /** 高德内部用来判断高分屏的标记（见 loadAMap 里的注释） */
    detectRetina?: number;
  }
}

let loading: Promise<any> | null = null;

/**
 * 触屏设备（iPad / 手机）的底图压色调备用方案。
 *
 * 桌面端给栅格瓦片套 CSS 滤镜没问题，但在触屏上等于每次拖动都要整屏重算；
 * 所以触屏上不用滤镜（见 styles/components.css），改用瓦片层上方一张静态色纱。
 * 只在高德退到「栅格瓦片」（.amap-layer-tile）时才需要：WebGL 画布底下本来就套不上滤镜，
 * 也就不必额外压色调，保持原样最省事。
 */
export function installMapTint(host: HTMLElement | null): void {
  const layers = host?.querySelector('.amap-layers');
  if (!layers) return;
  const raster = Boolean(layers.querySelector('.amap-layer-tile'));
  const existing = layers.querySelector<HTMLElement>('.amap-tint');
  if (existing) {
    existing.classList.toggle('amap-tint--raster', raster);
    return;
  }
  if (!raster) return;
  const tint = document.createElement('div');
  tint.className = 'amap-tint amap-tint--raster';
  tint.setAttribute('aria-hidden', 'true');
  layers.appendChild(tint);
}

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

/** 地图渲染选项的实验开关（由 URL 参数控制，不写存量配置）。 */
export interface MapRenderOptions {
  /** 强制底图按 1x 渲染（iPad 上像素量降到 1/4，画面会略软） */
  lowRes: boolean;
  /** 只留底色与道路，不画 POI 与注记 */
  lean: boolean;
  /** 不画底图文字注记（路名 / POI 名） */
  noLabel: boolean;
  /** 不画 POI 点（图标） */
  noPoint: boolean;
  /** 不画建筑 */
  noBuilding: boolean;
  /** 运行时隐藏注记图层（构造后调 layer.setVisible(false)，不需要重建地图） */
  hideLabels: boolean;
}
export function mapRenderOptions(search = window.location.search): MapRenderOptions {
  const params = new URLSearchParams(search);
  // iPad 实测：高德 2.0 的矢量文字注记会把主线程占住 300ms+（`?labels=0` 后同 zoom 可从 3fps 回到 58fps）。
  // 所以触屏设备默认不画底图注记，用 `?labels=1` 可以要回来；桌面保持原样。
  const labelsParam = params.get('labels');
  const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(any-pointer: coarse)').matches;
  return {
    lowRes: params.get('dpr') === '1',
    lean: params.has('lean'),
    noLabel: labelsParam === '0' || (labelsParam === null && coarse),
    noPoint: params.has('nopoint'),
    noBuilding: params.has('nobuilding'),
    hideLabels: labelsParam === 'off',
  };
}

const ALL_FEATURES = ['bg', 'point', 'road', 'building'];

/** 把 URL 开关翻译成 AMap 的 `features` / `showLabel`。 */
export function mapFeatureOptions(options: MapRenderOptions): {
  features: string[];
  showLabel: boolean;
} {
  if (options.lean) return { features: ['bg', 'road'], showLabel: false };
  const features = ALL_FEATURES.filter((feature) => {
    if (feature === 'point' && options.noPoint) return false;
    if (feature === 'building' && options.noBuilding) return false;
    return true;
  });
  return { features, showLabel: !options.noLabel };
}

/**
 * 注入 JSAPI 2.0 脚本，并把安全密钥的验证交给后端代理。
 *
 * 注意：高德在脚本初始化时读一次 `window.detectRetina`，决定按 1x 还是 dpr 倍渲染。
 * iPad（dpr 2）上按 2x 渲染等于画 4 倍像素，WebGL 很容易画不动；`?dpr=1` 把它压回 1x。
 * 所以必须在脚本执行前设置，不能等 AMap 加载完再改。
 */
export function loadAMap(config: AppConfig): Promise<any> {
  if (window.AMap) return Promise.resolve(window.AMap);
  if (loading) return loading;

  loading = new Promise((resolve, reject) => {
    window._AMapSecurityConfig = { serviceHost: absoluteServiceHost(config) };
    if (mapRenderOptions().lowRes) window.detectRetina = 0;
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
