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
  /** 是否按触屏设备（移动端）处理，仅用于 diag 展示 */
  touch: boolean;
  /** 这个 mode 是谁定的：url 参数 / 移动端的 .env / PC 固定 on */
  source: 'url' | 'env' | 'pc';
}

/**
 * 是否是移动端（iPad / iPhone / 安卓 / 鸿蒙）—— 只有这类设备才跟随 `.env` 的注记策略。
 *
 * 不能只看 `any-pointer: coarse`：Windows 触屏笔记本、接了触摸屏/数位板的台式机也会报 coarse，
 * 结果 PC 被当成平板、zoom ≥12 就没注记了。这里按平台判定：
 * - 移动 UA（含 Android / 鸿蒙）→ 移动端；
 * - iPadOS 13+ 的「桌面版网站」UA 是 Macintosh，用触点数（>1）区分；
 * - Windows / macOS / Linux 桌面（哪怕带触屏）→ 一律当 PC，注记始终显示。
 */
export function isTouchEnvironment(
  nav: Pick<Navigator, 'userAgent' | 'platform' | 'maxTouchPoints'> | undefined = typeof navigator === 'undefined'
    ? undefined
    : navigator,
): boolean {
  if (!nav) return false;
  const ua = nav.userAgent ?? '';
  if (/iPad|iPhone|iPod|Android|OpenHarmony|HarmonyOS/i.test(ua)) return true;
  // iPadOS 桌面模式：UA 伪装成 Mac，maxTouchPoints 是 5
  if (/Macintosh/i.test(ua) && (nav.maxTouchPoints ?? 0) > 1) return true;
  return false;
}

/**
 * 注记策略：**鼠标设备永远全显示**，`.env` 只作用于触屏设备（iPad / iPhone / 安卓）。
 *
 * 依据：只有触屏走 WebGL 矢量注记，高 zoom 会把主线程占满；PC 上同样渲染路径也不卡。
 * URL 参数（`?labels=` / `?labelzoom=`）用于调试，可覆盖任何设备的判断。
 */
export function resolveLabels(
  config: AppConfig,
  search = window.location.search,
  touch = isTouchEnvironment(),
): LabelSettings {
  const params = new URLSearchParams(search);
  const raw = params.get('labels');
  let mode: LabelsMode;
  let source: LabelSettings['source'];
  if (raw === 'on' || raw === '1') {
    mode = 'on';
    source = 'url';
  } else if (raw === 'off' || raw === '0') {
    mode = 'off';
    source = 'url';
  } else if (raw === 'auto') {
    mode = 'auto';
    source = 'url';
  } else if (touch) {
    mode = config.mapLabels;
    source = 'env';
  } else {
    // PC（鼠标设备）：固定全显示，`.env` 不影响
    mode = 'on';
    source = 'pc';
  }
  const zoomOverride = Number(params.get('labelzoom'));
  const maxZoom = Number.isFinite(zoomOverride) && zoomOverride > 0 ? zoomOverride : config.mapLabelMaxZoom;
  return { mode, maxZoom, touch, source };
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
