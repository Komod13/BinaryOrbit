/**
 * 只在 URL 带 `?fps=1` 时挂一个实时帧率角标。
 * 用途：在 iPad / 手机上直接看「拖动地图时掉不掉帧」，不需要连电脑调试。
 * 0 依赖、不参与构建逻辑，正常访问完全不会执行。
 */
export function installFpsMeter(): void {
  const enabled = new URLSearchParams(window.location.search).has('fps');
  if (!enabled) return;

  const badge = document.createElement('div');
  badge.className = 'fps-meter';
  badge.textContent = '采样中…';
  document.body.appendChild(badge);

  let frames = 0;
  let windowStart = performance.now();
  let previous = windowStart;
  let worstGap = 0;

  const tick = (now: number): void => {
    frames++;
    worstGap = Math.max(worstGap, now - previous);
    previous = now;

    const elapsed = now - windowStart;
    if (elapsed >= 500) {
      const fps = Math.round((frames * 1000) / elapsed);
      const level = fps >= 50 ? 'good' : fps >= 30 ? 'warn' : 'bad';
      badge.dataset.level = level;
      badge.textContent = `${fps} fps · 最差帧 ${Math.round(worstGap)}ms`;
      frames = 0;
      windowStart = now;
      worstGap = 0;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
