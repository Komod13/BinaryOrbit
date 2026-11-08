/**
 * iPad / 手机上的自检面板：URL 带 `?debug=1`（或兼容的 `?fps=1`）时才启用。
 *
 * 为什么要有：iPad 上没法开 DevTools。这个面板把「帧率、长任务、地图重绘节奏、
 * 标记重建耗时、渲染器、构建时间」画在页面上，并自动 / 手动 POST 到 `/api/diag`，
 * 由电脑那端的控制台打印出来（见 server/routes/diag.ts）。
 * 不带参数时整段代码不执行，对正常使用零影响。
 */

declare global {
  interface Window {
    __boDiag?: Record<string, unknown>;
  }
}

export const diagState = {
  /** 地图渲染器：移动 UA 下高德走 WebGL 画布，桌面 UA 下走栅格瓦片 */
  renderer: '?',
  markers: 0,
  rebuildMs: 0,
  /** 地图 move / mapmove 等事件计数，由面板换算成「每秒重绘次数」 */
  mapFrames: 0,
};

/** 两次上报之间的统计窗口：上报后清零，保证报上去的是「刚才那段拖动」的表现。 */
const windowStats = {
  minFps: 60,
  worstFrameMs: 0,
  longTasks: 0,
  maxTaskMs: 0,
  mapFpsMin: 0,
  mapFpsMax: 0,
};

function resetWindowStats(): void {
  windowStats.minFps = 60;
  windowStats.worstFrameMs = 0;
  windowStats.longTasks = 0;
  windowStats.maxTaskMs = 0;
  windowStats.mapFpsMin = 0;
  windowStats.mapFpsMax = 0;
}

export function installDiag(): void {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('debug') && !params.has('fps')) return;

  const panel = document.createElement('div');
  panel.className = 'diag-panel';
  panel.innerHTML = `
    <div class="diag-title">diag · <span data-k="build"></span></div>
    <div class="diag-row" data-k="fps"></div>
    <div class="diag-row" data-k="tasks"></div>
    <div class="diag-row" data-k="map"></div>
    <div class="diag-row" data-k="markers"></div>
    <div class="diag-row" data-k="env"></div>
    <button type="button" class="diag-report">上报到电脑控制台</button>
  `;
  document.body.appendChild(panel);

  const slots = new Map<string, HTMLElement>();
  for (const node of panel.querySelectorAll<HTMLElement>('[data-k]')) {
    slots.set(node.dataset.k as string, node);
  }
  const put = (key: string, text: string): void => {
    const node = slots.get(key);
    if (node && node.textContent !== text) node.textContent = text;
  };

  // ---- 长任务（主线程被霸占超过 50ms）。Safari 不支持时一直是 0 ----
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        windowStats.longTasks++;
        windowStats.maxTaskMs = Math.max(windowStats.maxTaskMs, entry.duration);
      }
    });
    observer.observe({ entryTypes: ['longtask'] });
  } catch {
    /* 这个浏览器没有 longtask */
  }

  let frames = 0;
  let windowStart = performance.now();
  let previous = windowStart;
  let worstGap = 0;
  let fps = 0;
  let mapFramesStart = diagState.mapFrames;
  let mapFps = 0;

  const snapshot = (reason: string): Record<string, unknown> => ({
    reason,
    build: __BUILD_STAMP__,
    page: window.location.pathname,
    fps,
    minFps: windowStats.minFps,
    worstFrameMs: Math.round(windowStats.worstFrameMs),
    longTasks: windowStats.longTasks,
    maxTaskMs: Math.round(windowStats.maxTaskMs),
    mapFramesPerSec: mapFps,
    mapFramesMin: windowStats.mapFpsMin,
    mapFramesMax: windowStats.mapFpsMax,
    renderer: diagState.renderer,
    markers: diagState.markers,
    lastRebuildMs: Math.round(diagState.rebuildMs),
    dpr: window.devicePixelRatio,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    touchPoints: navigator.maxTouchPoints,
  });

  const button = panel.querySelector<HTMLButtonElement>('.diag-report');
  let sending = false;

  const report = async (reason: string, fromButton = false): Promise<void> => {
    if (sending) return;
    sending = true;
    if (fromButton && button) {
      button.disabled = true;
      button.textContent = '上报中…';
    }
    try {
      const response = await fetch('/api/diag', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(snapshot(reason)),
      });
      if (fromButton && button) {
        button.textContent = response.ok ? '已上报，看电脑控制台' : '上报失败';
      }
      resetWindowStats();
    } catch {
      if (fromButton && button) button.textContent = '上报失败（连不上服务）';
    } finally {
      sending = false;
      if (fromButton && button) {
        setTimeout(() => {
          button.disabled = false;
          button.textContent = '再上报一次';
        }, 2000);
      }
    }
  };

  button?.addEventListener('click', () => void report('手动上报', true));

  // 进页面 8 秒后自动上报一次，之后每 20 秒再报一次（每次报的是这段时间的最差值）
  const start = performance.now();
  let nextAuto = 8000;

  const tick = (now: number): void => {
    frames++;
    const gap = now - previous;
    previous = now;
    worstGap = Math.max(worstGap, gap);
    windowStats.worstFrameMs = Math.max(windowStats.worstFrameMs, gap);

    const elapsed = now - windowStart;
    if (elapsed >= 500) {
      fps = Math.round((frames * 1000) / elapsed);
      mapFps = Math.round(((diagState.mapFrames - mapFramesStart) * 1000) / elapsed);
      if (now - start > 2000) {
        // 前 2 秒包含首屏加载，不进最差值统计
        windowStats.minFps = Math.min(windowStats.minFps, fps);
        windowStats.mapFpsMin = windowStats.mapFpsMin ? Math.min(windowStats.mapFpsMin, mapFps) : mapFps;
        windowStats.mapFpsMax = Math.max(windowStats.mapFpsMax, mapFps);
      }

      const level = fps >= 50 ? 'good' : fps >= 30 ? 'warn' : 'bad';
      panel.dataset.level = level;
      put('build', __BUILD_STAMP__);
      put('fps', `${fps} fps（最低 ${windowStats.minFps}）· 最差帧 ${Math.round(windowStats.worstFrameMs)}ms`);
      put('tasks', `长任务 ${windowStats.longTasks} 次 · 最长 ${Math.round(windowStats.maxTaskMs)}ms`);
      put('map', `地图 ${mapFps} 帧/s · ${diagState.renderer}`);
      put('markers', `标记 ${diagState.markers} 个 · 重建 ${Math.round(diagState.rebuildMs)}ms`);
      put('env', `dpr ${window.devicePixelRatio} · ${window.innerWidth}×${window.innerHeight}`);
      window.__boDiag = snapshot('实时');
      frames = 0;
      windowStart = now;
      worstGap = 0;
      mapFramesStart = diagState.mapFrames;
    }

    if (now - start >= nextAuto) {
      nextAuto += 20000;
      void report('自动上报');
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
