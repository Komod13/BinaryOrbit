import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue';

/**
 * 移动端底部卡片的「上拉」交互。
 *
 * 只接管卡片顶部（把手 / 标题区）的手势，内容区仍然正常滚动：
 * - 上拉：卡片跟着手指长高，松手后吸附到「半屏」或「全屏」
 * - 下滑：从全屏回到半屏
 * - 轻点把手：在半屏 / 全屏之间切换
 *
 * 高度用内联 px 写到卡片上，方便跟手；收起后会在动画结束时清掉，
 * 让卡片重新回到「内容自适应 + CSS max-height」的状态。
 */

const MOBILE_QUERY = '(max-width: 859px)';
const SNAP_MS = 240;
const MIN_HEIGHT = 120;
const TAP_SLOP = 5;
const FLICK_VELOCITY = 0.4;
const FALLBACK_RADIUS = 32;

function viewportHeight(): number {
  return Math.round(window.visualViewport?.height ?? window.innerHeight);
}

function isMobile(): boolean {
  return window.matchMedia(MOBILE_QUERY).matches;
}

export function useSheetDrag(panel: Ref<HTMLElement | null>) {
  const dragging = ref(false);
  const expanded = ref(false);

  let active = false;
  let pointerId: number | null = null;
  let startY = 0;
  let startHeight = 0;
  let moveHeight = 0;
  let lastY = 0;
  let lastTime = 0;
  let velocity = 0;
  let wasExpanded = false;
  let onGrip = false;
  let peekBase = 0;
  let radiusBase = FALLBACK_RADIUS;
  let collapseTimer: ReturnType<typeof setTimeout> | null = null;

  function hostElement(element: HTMLElement): HTMLElement {
    return element.closest('dialog') ?? element;
  }

  function setClass(name: string, on: boolean): void {
    const element = panel.value;
    if (!element) return;
    element.classList.toggle(name, on);
    hostElement(element).classList.toggle(name, on);
  }

  function setExpanded(on: boolean): void {
    expanded.value = on;
    setClass('is-expanded', on);
  }

  function setDragging(on: boolean): void {
    dragging.value = on;
    setClass('is-dragging', on);
  }

  function clearCollapseTimer(): void {
    if (collapseTimer) {
      clearTimeout(collapseTimer);
      collapseTimer = null;
    }
  }

  function stopListening(): void {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerCancel);
  }

  /** 从 CSS 读取统一的大圆角，保证 JS 渐变和样式表里的数值一致 */
  function readRadiusBase(element: HTMLElement): number {
    const value = Number.parseFloat(getComputedStyle(element).getPropertyValue('--sheet-radius'));
    return Number.isFinite(value) && value > 0 ? value : FALLBACK_RADIUS;
  }

  /** 顶部圆角：半屏时用大圆角，拖动过程中随高度线性收到 0，全屏时是直角 */
  function setTopRadius(px: number): void {
    const element = panel.value;
    if (!element) return;
    const value = `${Math.max(0, Math.round(px))}px`;
    element.style.setProperty('--sheet-top-radius', value);
    // dialog 自身也要同步，避免 iOS 用 UA 的 dialog 圆角裁剪内容
    hostElement(element).style.setProperty('--sheet-top-radius', value);
  }

  function clearTopRadius(): void {
    const element = panel.value;
    if (!element) return;
    element.style.removeProperty('--sheet-top-radius');
    hostElement(element).style.removeProperty('--sheet-top-radius');
  }

  /** 临时回到「内容自适应」量一次收起高度，不会触发可见的重排 */
  function measurePeek(): number {
    const element = panel.value;
    if (!element) return 0;
    const expandedBefore = element.classList.contains('is-expanded');
    const draggingBefore = element.classList.contains('is-dragging');
    const previous = element.style.height;
    if (expandedBefore) setExpanded(false);
    if (draggingBefore) setDragging(false);
    element.style.height = 'auto';
    const height = Math.round(element.getBoundingClientRect().height);
    element.style.height = previous;
    if (expandedBefore) setExpanded(true);
    if (draggingBefore) setDragging(true);
    return height;
  }

  function onPointerDown(event: PointerEvent): void {
    if (!isMobile() || active) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    const element = panel.value;
    if (!element) return;

    const target = event.target as HTMLElement | null;
    if (!target) return;
    // 按钮、输入框这些交互控件不参与拖拽，避免抢掉点击
    if (target.closest('button, a, input, textarea, select, label')) return;

    const grip = target.closest('.sheet-grip');
    const header = target.closest('.sheet-head, .sheet-title, .sheet-sub');
    if (!grip && !header) return;

    active = true;
    pointerId = event.pointerId;
    onGrip = Boolean(grip);
    wasExpanded = expanded.value;
    clearCollapseTimer();
    startY = event.clientY;
    lastY = startY;
    lastTime = event.timeStamp;
    velocity = 0;
    startHeight = element.getBoundingClientRect().height;
    moveHeight = startHeight;
    peekBase = measurePeek();
    radiusBase = readRadiusBase(element);

    // 拖拽期间先解除 max-height 限制，手感才是「卡片长高」而不是卡住不动
    setDragging(true);
    element.style.height = `${Math.round(startHeight)}px`;

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    event.preventDefault();
  }

  function onPointerMove(event: PointerEvent): void {
    if (!active) return;
    if (pointerId !== null && event.pointerId !== pointerId) return;

    const element = panel.value;
    if (!element) return;

    const full = viewportHeight();
    const delta = startY - event.clientY;
    const next = Math.max(MIN_HEIGHT, Math.min(full, startHeight + delta));
    moveHeight = next;
    element.style.height = `${Math.round(next)}px`;

    // 圆角随高度从大圆角渐变到 0（全屏时顶部是直角）
    const span = Math.max(1, full - peekBase);
    const progress = Math.min(1, Math.max(0, (next - peekBase) / span));
    setTopRadius(radiusBase * (1 - progress));

    const dt = event.timeStamp - lastTime;
    if (dt > 0) velocity = (event.clientY - lastY) / dt;
    lastY = event.clientY;
    lastTime = event.timeStamp;

    event.preventDefault();
  }

  /** pointercancel 的坐标不可靠（常为 0），不能走 onPointerUp 的位移判定 */
  function onPointerCancel(event: PointerEvent): void {
    if (!active) return;
    if (pointerId !== null && event.pointerId !== pointerId) return;
    active = false;
    pointerId = null;
    stopListening();
    const element = panel.value;
    setDragging(false);
    setExpanded(false);
    if (!element) return;
    element.style.height = '';
    element.scrollTop = 0;
    clearTopRadius();
  }

  function onPointerUp(event: PointerEvent): void {
    if (!active) return;
    if (pointerId !== null && event.pointerId !== pointerId) return;
    active = false;
    pointerId = null;
    stopListening();

    const element = panel.value;
    if (!element) return;

    const travelled = Math.abs(event.clientY - startY);
    const full = viewportHeight();

    // 先回到默认状态量一次「自然收起高度」：此时 CSS 的 max-height 会生效
    setDragging(false);
    setExpanded(false);
    const peek = measurePeek();

    let expand: boolean;
    if (travelled <= TAP_SLOP) {
      expand = onGrip ? !wasExpanded : wasExpanded;
    } else if (velocity < -FLICK_VELOCITY) {
      expand = true;
    } else if (velocity > FLICK_VELOCITY) {
      expand = false;
    } else {
      expand = moveHeight > (peek + full) / 2;
    }

    if (expand) {
      setExpanded(true);
      setTopRadius(0);
      element.style.height = `${full}px`;
      return;
    }

    setExpanded(false);
    setTopRadius(radiusBase);
    element.style.height = `${peek}px`;
    clearCollapseTimer();
    collapseTimer = setTimeout(() => {
      collapseTimer = null;
      const current = panel.value;
      if (!current) return;
      current.style.height = '';
      if (current.scrollTop > 0) current.scrollTop = 0;
    }, SNAP_MS);
  }

  function onViewportResize(): void {
    const element = panel.value;
    if (!element) return;
    // 转回桌面宽度时把内联高度交还给 CSS，否则右侧栏会被固定成手机屏高
    if (!isMobile()) {
      reset();
      return;
    }
    if (!expanded.value || active) return;
    element.style.height = `${viewportHeight()}px`;
  }

  function reset(): void {
    const element = panel.value;
    if (!element) return;
    clearCollapseTimer();
    stopListening();
    active = false;
    pointerId = null;
    element.style.height = '';
    element.scrollTop = 0;
    clearTopRadius();
    setDragging(false);
    setExpanded(false);
  }

  onMounted(() => {
    panel.value?.addEventListener('pointerdown', onPointerDown);
    window.visualViewport?.addEventListener('resize', onViewportResize);
    window.addEventListener('resize', onViewportResize);
  });

  onBeforeUnmount(() => {
    panel.value?.removeEventListener('pointerdown', onPointerDown);
    window.visualViewport?.removeEventListener('resize', onViewportResize);
    window.removeEventListener('resize', onViewportResize);
    clearCollapseTimer();
    stopListening();
  });

  return { dragging, expanded, reset };
}
