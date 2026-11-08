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
    window.removeEventListener('pointercancel', onPointerUp);
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

    // 拖拽期间先解除 max-height 限制，手感才是「卡片长高」而不是卡住不动
    setDragging(true);
    element.style.height = `${Math.round(startHeight)}px`;

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
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

    const dt = event.timeStamp - lastTime;
    if (dt > 0) velocity = (event.clientY - lastY) / dt;
    lastY = event.clientY;
    lastTime = event.timeStamp;

    event.preventDefault();
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
    const previous = element.style.height;
    element.style.height = 'auto';
    const peek = Math.round(element.getBoundingClientRect().height);
    element.style.height = previous;

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
      element.style.height = `${full}px`;
      return;
    }

    setExpanded(false);
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
