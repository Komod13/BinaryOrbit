<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { isTouchEnvironment, loadAMap, resolveLabels } from '../lib/amap.ts';
import type { LabelSettings } from '../lib/amap.ts';
import { diagState } from '../lib/diag.ts';
import { shortName } from '../lib/format.ts';
import {
  CLUSTER_GRID,
  MAX_ZOOM,
  MIN_ZOOM,
  forcesSpread,
  spreadOffsets,
} from '../lib/markerLayout.ts';
import type { AppConfig, FilterKind, MapApi, MapViewport, Place, PlaceType } from '../lib/types.ts';
import burgerIcon from '../assets/icons/burger.png';
import cameraIcon from '../assets/icons/camera.png';
import pinIcon from '../assets/icons/pin.png';

const props = withDefaults(
  defineProps<{
    config: AppConfig;
    initialView: MapViewport;
    places: Place[];
    filter: FilterKind;
    highlightAdcodes?: string[];
    radius?: number | null;
    /** 搜索中选中的地点：地图会平移过去，并用图钉标出来 */
    picked?: { lng: number; lat: number; name: string } | null;
  }>(),
  { highlightAdcodes: () => [], radius: null, picked: null },
);

const emit = defineEmits<{
  markerClick: [id: number];
  viewChange: [view: MapViewport];
  /** 长按地图选了「添加餐厅 / 添加景点」 */
  draftAdd: [payload: { kind: PlaceType; lng: number; lat: number }];
}>();

const host = ref<HTMLDivElement | null>(null);
const error = ref('');
const ready = ref(false);
const labelsOn = ref(false);
const zoom = ref(props.initialView.zoom);

const map = shallowRef<any>(null);
let AMap: any = null;
let circle: any = null;
let pickMarker: any = null;
let pickElement: HTMLDivElement | null = null;
let clusterTimer: ReturnType<typeof setTimeout> | null = null;
// 手势进行中不做聚合重建：iOS/WKWebView 上删除+重建几十个 DOM 标记会直接卡住一帧以上
let interacting = false;
let pendingRebuild = false;

/** 长按：按住不动 520ms 算选点，手指 / 鼠标挪超过 8px 就当作在拖地图 */
const LONG_PRESS_MS = 520;
const LONG_PRESS_TOLERANCE = 8;

let draftMarker: any = null;
let draftElement: HTMLDivElement | null = null;
let draftPoint: { lng: number; lat: number } | null = null;
// 长按抬手（或点选项）后高德还会补一个 click，用这个标记把那个 click 忽略掉
let suppressMapClick = false;
// 程序化平移（例如手机上表单占掉半屏后把选点挪回可见区域）也会触发 movestart，
// 这段时间内不清选点浮窗，否则刚选的图钉会被自己挪没
const PROGRAMMATIC_MOVE_GRACE = 600;
let draftMoveGraceUntil = 0;
let pressTimer: ReturnType<typeof setTimeout> | null = null;
let pressOrigin: { x: number; y: number } | null = null;

interface MarkerGroup {
  places: Place[];
  /** 高 zoom 下的像素错开量：只挪显示位置，经纬度仍用真实坐标 */
  dx: number;
  dy: number;
}

interface MarkerSlot {
  marker: any;
  kind: 'pin' | 'cluster';
  el: HTMLDivElement;
}

let slots: MarkerSlot[] = [];

const visiblePlaces = computed(() =>
  props.filter === 'all' ? props.places : props.places.filter((place) => place.type === props.filter),
);

const highlight = computed(() => new Set(props.highlightAdcodes));

function clearMarkers(): void {
  if (map.value && slots.length) map.value.remove(slots.map((slot) => slot.marker));
  slots = [];
}

/**
 * 切成「每组一个标记」：常规层级按像素网格聚合；到最大/次大层级强制一对一点位
 * （同一个商场里的两家店也能分别点开，见 markerLayout.ts）。
 */
function clusterPoints(): MarkerGroup[] {
  const instance = map.value;
  if (!instance) return [];
  const currentZoom = instance.getZoom?.() ?? zoom.value;
  if (forcesSpread(currentZoom)) return spreadGroups(instance);

  const cells = new Map<string, MarkerGroup>();
  for (const place of visiblePlaces.value) {
    const pixel = instance.lngLatToContainer([place.lng, place.lat]);
    if (!pixel) continue;
    const key = `${Math.floor(pixel.x / CLUSTER_GRID)}:${Math.floor(pixel.y / CLUSTER_GRID)}`;
    const cell = cells.get(key);
    if (cell) cell.places.push(place);
    else cells.set(key, { places: [place], dx: 0, dy: 0 });
  }
  return [...cells.values()];
}

/** 强展示层级：先算像素位置，再把互相压住的图钉错开。 */
function spreadGroups(instance: any): MarkerGroup[] {
  const items: { place: Place; x: number; y: number }[] = [];
  for (const place of visiblePlaces.value) {
    const pixel = instance.lngLatToContainer([place.lng, place.lat]);
    if (!pixel) continue;
    items.push({ place, x: pixel.x, y: pixel.y });
  }
  // 按 id 排序：同一批点位的错开方向稳定，重建时不会左右横跳
  items.sort((left, right) => left.place.id - right.place.id);
  const offsets = spreadOffsets(items);
  return items.map((item, index) => ({
    places: [item.place],
    dx: offsets[index].x,
    dy: offsets[index].y,
  }));
}

/** 标记 DOM 只建一次，之后只改内容/位置（避免每次重建都重新解码图标、重排 DOM）。 */
function createPinElement(): HTMLDivElement {
  const element = document.createElement('div');
  element.className = 'pin-marker';
  element.innerHTML =
    '<span class="pin-dot"><span class="pin-plate"><img class="pin-img" alt="" /></span></span>' +
    '<span class="pin-label"></span>';
  element.addEventListener('click', (event) => {
    event.stopPropagation();
    const id = Number(element.dataset.placeId);
    if (Number.isFinite(id)) emit('markerClick', id);
  });
  return element;
}

function fillPin(element: HTMLDivElement, place: Place): void {
  element.dataset.placeId = String(place.id);
  element.className = `pin-marker pin-marker--${place.type}`;
  if (highlight.value.size) {
    element.classList.add(highlight.value.has(place.cityAdcode ?? '') ? 'is-highlight' : 'is-dim');
  }
  const image = element.querySelector<HTMLImageElement>('.pin-img');
  const icon = place.type === 'restaurant' ? burgerIcon : cameraIcon;
  if (image && image.getAttribute('src') !== icon) image.src = icon;
  const label = element.querySelector('.pin-label');
  const text = shortName(place.name);
  if (label && label.textContent !== text) label.textContent = text;
  element.title = place.name;
}

function createClusterElement(): HTMLDivElement {
  const element = document.createElement('div');
  element.className = 'pin-cluster';
  element.innerHTML = '<span></span>';
  element.addEventListener('click', (event) => {
    event.stopPropagation();
    const places = (element as unknown as { __places?: Place[] }).__places;
    if (!places?.length) return;
    const current = map.value?.getZoom() ?? zoom.value;
    // 聚合成气泡时至少还要再进一级：16 → 18，直接跨进「强制单点」层级
    const next = Math.min(MAX_ZOOM, Math.max(current + 2, 14));
    const lng = places.reduce((total, place) => total + place.lng, 0) / places.length;
    const lat = places.reduce((total, place) => total + place.lat, 0) / places.length;
    map.value?.setZoomAndCenter(next, [lng, lat]);
  });
  return element;
}

function fillCluster(element: HTMLDivElement, places: Place[]): void {
  (element as unknown as { __places?: Place[] }).__places = places;
  const count = element.querySelector('span');
  const text = String(places.length);
  if (count && count.textContent !== text) count.textContent = text;
  element.title = `${places.length} 个地点`;
}

function createSlot(kind: 'pin' | 'cluster'): MarkerSlot {
  const el = kind === 'pin' ? createPinElement() : createClusterElement();
  const marker = new AMap.Marker({
    content: el,
    anchor: kind === 'pin' ? 'bottom-center' : 'center',
    zIndex: kind === 'pin' ? 120 : 130,
  });
  return { marker, kind, el };
}

function rebuildMarkers(): void {
  const instance = map.value;
  if (!instance || !AMap) return;

  const started = performance.now();
  let used = 0;
  for (const group of clusterPoints()) {
    const kind: 'pin' | 'cluster' = group.places.length === 1 ? 'pin' : 'cluster';
    let slot: MarkerSlot | undefined = slots[used];
    if (slot && slot.kind !== kind) {
      instance.remove(slot.marker);
      slot = undefined;
    }
    if (!slot) {
      slot = createSlot(kind);
      slots[used] = slot;
      instance.add(slot.marker);
    }

    if (kind === 'pin') {
      const place = group.places[0] as Place;
      fillPin(slot.el, place);
      slot.marker.setPosition([place.lng, place.lat]);
    } else {
      fillCluster(slot.el, group.places);
      const lng = group.places.reduce((total, place) => total + place.lng, 0) / group.places.length;
      const lat = group.places.reduce((total, place) => total + place.lat, 0) / group.places.length;
      slot.marker.setPosition([lng, lat]);
    }
    // 错开只改显示位置：真实坐标不动，点开详情仍然对得上
    slot.marker.setOffset(new AMap.Pixel(group.dx, group.dy));
    slot.marker.show();
    used++;
  }

  for (let i = used; i < slots.length; i++) slots[i]?.marker.hide();

  diagState.markers = used;
  diagState.places = props.places.length;
  diagState.zoom = map.value?.getZoom?.() ?? diagState.zoom;
  diagState.rebuildMs = performance.now() - started;
}

function scheduleRebuild(delay = 120): void {
  if (interacting) {
    pendingRebuild = true;
    return;
  }
  if (clusterTimer) clearTimeout(clusterTimer);
  clusterTimer = setTimeout(() => {
    clusterTimer = null;
    if (interacting) {
      pendingRebuild = true;
      return;
    }
    rebuildMarkers();
  }, delay);
}

function endInteraction(): void {
  interacting = false;
  if (pendingRebuild) {
    pendingRebuild = false;
    scheduleRebuild(0);
  }
}

function syncLabels(): void {
  const current = map.value?.getZoom() ?? 0;
  zoom.value = current;
  labelsOn.value = current >= 13;
  diagState.zoom = current;
}

function syncCircle(): void {
  const instance = map.value;
  if (!instance) return;
  if (!props.radius) {
    if (circle) {
      instance.remove(circle);
      circle = null;
    }
    return;
  }
  const center = instance.getCenter();
  const position = [center.getLng(), center.getLat()];
  if (!circle) {
    circle = new AMap.Circle({
      center: position,
      radius: props.radius,
      strokeColor: '#8a658a',
      strokeWeight: 1,
      strokeOpacity: 0.75,
      fillColor: '#c9a1c8',
      fillOpacity: 0.08,
      zIndex: 90,
      bubble: true,
    });
    instance.add(circle);
  } else {
    circle.setCenter(position);
    circle.setRadius(props.radius);
  }
}

/** 选中地点的图钉：和聚合标记分开管理，不受筛选/聚合影响。 */
function syncPick(): void {
  const instance = map.value;
  if (!instance || !AMap) return;

  const target = props.picked;
  if (!target) {
    if (pickMarker) {
      instance.remove(pickMarker);
      pickMarker = null;
      pickElement = null;
    }
    return;
  }

  if (!pickMarker || !pickElement) {
    const element = document.createElement('div');
    element.className = 'pick-pin';
    element.innerHTML =
      '<span class="pick-pin-label"></span><img class="pick-pin-img" alt="" aria-hidden="true" />';
    const image = element.querySelector<HTMLImageElement>('.pick-pin-img');
    if (image) image.src = pinIcon;
    pickElement = element;
    pickMarker = new AMap.Marker({
      content: element,
      anchor: 'bottom-center',
      zIndex: 200,
      clickable: false,
    });
    instance.add(pickMarker);
  }

  const label = pickElement.querySelector('.pick-pin-label');
  if (label && label.textContent !== target.name) label.textContent = target.name;
  pickMarker.setPosition([target.lng, target.lat]);
  pickMarker.show();

  // 平移 + 拉到街道级；已经比 16 更近时保持用户当前的缩放
  const level = Math.max(instance.getZoom?.() ?? props.initialView.zoom, 16);
  instance.setZoomAndCenter(level, [target.lng, target.lat], false, 300);
}

function emitView(): void {
  const instance = map.value;
  if (!instance) return;
  const center = instance.getCenter();
  emit('viewChange', { lng: center.getLng(), lat: center.getLat(), zoom: instance.getZoom() });
}

/**
 * 长按选点：在该点放一个红图钉 + 小浮窗（添加餐厅 / 添加景点）。
 *
 * 高德 2.0 的 Map 事件里没有 longpress（只有 Overlay 有），所以自己在容器上听 pointer 事件：
 * 按住不动 520ms 算选点，挪动超过 8px 或松手就当作在拖地图。
 */
function createDraftElement(): HTMLDivElement {
  const element = document.createElement('div');
  element.className = 'draft';
  element.innerHTML =
    '<div class="draft-menu">' +
    '<button class="draft-option draft-option--restaurant" type="button" data-kind="restaurant">' +
    '<span class="draft-dot"></span>添加餐厅</button>' +
    '<button class="draft-option draft-option--spot" type="button" data-kind="spot">' +
    '<span class="draft-dot"></span>添加景点</button>' +
    '</div>' +
    '<img class="draft-pin" alt="" aria-hidden="true" />';
  const image = element.querySelector<HTMLImageElement>('.draft-pin');
  if (image) image.src = pinIcon;
  element.addEventListener('click', (event) => {
    event.stopPropagation();
    const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('.draft-option');
    if (!button || !draftPoint) return;
    const kind: PlaceType = button.dataset.kind === 'spot' ? 'spot' : 'restaurant';
    // 收起菜单但保留图钉：填表期间还能看到自己选的是哪个点
    element.classList.add('is-choosing');
    suppressMapClick = true;
    emit('draftAdd', { kind, lng: draftPoint.lng, lat: draftPoint.lat });
  });
  return element;
}

function showDraftMenu(clientX: number, clientY: number): void {
  const instance = map.value;
  if (!instance || !AMap || !host.value) return;
  const rect = host.value.getBoundingClientRect();
  const point = instance.containerToLngLat(new AMap.Pixel(clientX - rect.left, clientY - rect.top));
  if (!point) return;
  draftPoint = { lng: point.getLng(), lat: point.getLat() };
  if (!draftMarker || !draftElement) {
    draftElement = createDraftElement();
    draftMarker = new AMap.Marker({ content: draftElement, anchor: 'bottom-center', zIndex: 220 });
    instance.add(draftMarker);
  }
  draftElement.classList.remove('is-choosing');
  draftMarker.setPosition([draftPoint.lng, draftPoint.lat]);
  draftMarker.show();
  suppressMapClick = true;
  // 平板 / 手机上给一点触觉反馈，不支持就算了
  navigator.vibrate?.(12);
}

function clearDraft(): void {
  cancelPress();
  draftPoint = null;
  draftElement?.classList.remove('is-choosing');
  draftMarker?.hide();
}

function cancelPress(): void {
  if (pressTimer) {
    clearTimeout(pressTimer);
    pressTimer = null;
  }
  pressOrigin = null;
}

/** 按在图钉 / 浮窗 / 聚合气泡上时不触发长按选点 */
function pressOnOverlay(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return Boolean(element?.closest?.('.pin-marker, .pin-cluster, .pick-pin, .draft'));
}

function onHostPointerDown(event: PointerEvent): void {
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  // 新的一次按下：之后那个 click 该算数（用来关掉浮窗）
  suppressMapClick = false;
  if (pressOnOverlay(event.target)) return;
  cancelPress();
  pressOrigin = { x: event.clientX, y: event.clientY };
  pressTimer = setTimeout(() => {
    pressTimer = null;
    const origin = pressOrigin;
    pressOrigin = null;
    if (origin) showDraftMenu(origin.x, origin.y);
  }, LONG_PRESS_MS);
}

function onHostPointerMove(event: PointerEvent): void {
  if (!pressOrigin) return;
  const moved = Math.hypot(event.clientX - pressOrigin.x, event.clientY - pressOrigin.y);
  if (moved > LONG_PRESS_TOLERANCE) cancelPress();
}

function onHostContextMenu(event: MouseEvent): void {
  // 长按 / 右键刚弹出选点浮窗时，不要叠上浏览器自己的菜单
  if (draftPoint || pressTimer) event.preventDefault();
}

/**
 * 底图注记的运行时开关。
 *
 * 为什么不用构造参数：`showLabel` 只能在 `new AMap.Map` 时给，而我们需要「低 zoom 留城市名、
 * 高 zoom 关掉」（iPad 实测高 zoom 的路名/POI 名会把主线程占住 300ms+）。高德 2.0 把注记
 * 放在独立的 Labels* 图层里，`layer.setVisible()` 就能切，不需要重建地图。
 */
let labelSettings: LabelSettings = { mode: 'on', maxZoom: 12, touch: false, source: 'pc' };
let labelLayers: any[] = [];
let labelsVisibleNow: boolean | null = null;

function collectLabelLayers(): any[] {
  const instance = map.value;
  if (!instance?.getLayers) return labelLayers;
  if (!labelLayers.length) {
    const layers = instance.getLayers() ?? [];
    diagState.mapLayers = layers.map((layer: any) => String(layer?.CLASS_NAME ?? '?')).join(',');
    labelLayers = layers.filter((layer: any) => /Label/i.test(String(layer?.CLASS_NAME ?? '')));
    diagState.labelLayers = String(labelLayers.length);
  }
  return labelLayers;
}

function applyLabelVisibility(visible: boolean): void {
  const layers = collectLabelLayers();
  if (!layers.length) {
    diagState.labelsVisible = 'no-layer';
    return;
  }
  diagState.labelsVisible = visible ? 'on' : 'off';
  if (labelsVisibleNow === visible) return;
  labelsVisibleNow = visible;
  for (const layer of layers) {
    if (typeof layer.setVisible === 'function') layer.setVisible(visible);
    else if (visible) layer.show?.();
    else layer.hide?.();
  }
}

/** auto：低 zoom 显示、高 zoom 隐藏；on：始终显示；off：始终隐藏。 */
function labelsWanted(): boolean {
  if (labelSettings.mode === 'on') return true;
  if (labelSettings.mode === 'off') return false;
  return (map.value?.getZoom() ?? 0) < labelSettings.maxZoom;
}

function syncLabelsByZoom(): void {
  applyLabelVisibility(labelsWanted());
  // 注记图层可能在首帧之后才挂上，没找到就退避重试几次
  if (!labelLayers.length) {
    for (const delay of [200, 600, 1500, 3000]) {
      setTimeout(() => {
        if (!labelLayers.length) applyLabelVisibility(labelsWanted());
      }, delay);
    }
  }
}

onMounted(async () => {
  try {
    AMap = await loadAMap(props.config);
  } catch (loadError) {
    error.value = (loadError as Error).message;
    return;
  }
  if (!host.value) return;

  labelSettings = resolveLabels(props.config, undefined, isTouchEnvironment());
  diagState.mapOptions =
    `labels:${labelSettings.mode}<${labelSettings.maxZoom}>@${labelSettings.touch ? 'touch' : 'mouse'}` +
    `/${labelSettings.source}`;
  const instance = new AMap.Map(host.value, {
    zoom: props.initialView.zoom,
    center: [props.initialView.lng, props.initialView.lat],
    viewMode: '2D',
    resizeEnable: true,
    zooms: [MIN_ZOOM, MAX_ZOOM],
    // `off` 时直接不画注记；`auto` 先画出来，之后再按 zoom 用图层开关隐藏（见 syncLabelsByZoom）
    showLabel: labelSettings.mode !== 'off',
  });
  map.value = instance;
  ready.value = true;

  instance.on('complete', () => {
    syncLabelsByZoom();
    rebuildMarkers();
    syncLabels();
    syncCircle();
    syncPick();
    emitView();
    // 高德在移动 UA 下走 WebGL 画布，桌面 UA 下走栅格瓦片（见 diag 面板 / components.css）
    diagState.renderer = host.value?.querySelector('canvas.amap-layer') ? 'webgl' : 'raster';
  });
  // 地图自己的重绘节奏：和 rAF 帧率对比，能区分「浏览器卡」还是「高德画得慢」
  // 同一个动画帧里可能连发 move / mapmove 两个事件，用 rAF 去重，最多算一帧
  let framePending = false;
  const countMapFrame = (): void => {
    if (framePending) return;
    framePending = true;
    requestAnimationFrame(() => {
      framePending = false;
    });
    diagState.mapFrames++;
  };
  for (const event of ['move', 'mapmove', 'dragging']) {
    instance.on(event, countMapFrame);
  }
  instance.on('zoomchange', () => {
    diagState.mapFrames++;
  });
  instance.on('movestart', () => {
    interacting = true;
    if (performance.now() > draftMoveGraceUntil) clearDraft();
  });
  instance.on('zoomstart', () => {
    interacting = true;
    if (performance.now() > draftMoveGraceUntil) clearDraft();
  });
  instance.on('click', () => {
    // 长按抬手 / 点选项之后紧跟着的 click 不算「点了空白处」
    if (suppressMapClick) {
      suppressMapClick = false;
      return;
    }
    clearDraft();
  });
  instance.on('zoomend', () => {
    syncLabels();
    syncLabelsByZoom();
    syncCircle();
    emitView();
    endInteraction();
    scheduleRebuild();
  });
  instance.on('moveend', () => {
    syncCircle();
    emitView();
    endInteraction();
    scheduleRebuild();
  });

  // 长按选点：高德 Map 没有 longpress，自己在容器上计时
  const hostNode = host.value;
  hostNode.addEventListener('pointerdown', onHostPointerDown);
  hostNode.addEventListener('pointermove', onHostPointerMove);
  hostNode.addEventListener('pointerup', cancelPress);
  hostNode.addEventListener('pointercancel', cancelPress);
  hostNode.addEventListener('pointerleave', cancelPress);
  hostNode.addEventListener('contextmenu', onHostContextMenu);
});

watch(() => [props.places, props.filter, props.highlightAdcodes], () => scheduleRebuild(), { deep: false });
watch(() => props.radius, () => syncCircle());
watch(() => props.picked, () => syncPick());

onBeforeUnmount(() => {
  clearMarkers();
  if (clusterTimer) clearTimeout(clusterTimer);
  cancelPress();
  const hostNode = host.value;
  hostNode?.removeEventListener('pointerdown', onHostPointerDown);
  hostNode?.removeEventListener('pointermove', onHostPointerMove);
  hostNode?.removeEventListener('pointerup', cancelPress);
  hostNode?.removeEventListener('pointercancel', cancelPress);
  hostNode?.removeEventListener('pointerleave', cancelPress);
  hostNode?.removeEventListener('contextmenu', onHostContextMenu);
  pickMarker = null;
  pickElement = null;
  draftMarker = null;
  draftElement = null;
  map.value?.destroy?.();
  map.value = null;
});

defineExpose<MapApi>({
  setView(center, level) {
    map.value?.setZoomAndCenter(level ?? 13, [center.lng, center.lat]);
  },
  focusOn(center, level = 16) {
    const instance = map.value;
    if (!instance) return;
    // 已比目标更近时保持用户当前的缩放，只平移
    const next = Math.max(level, instance.getZoom?.() ?? level);
    instance.setZoomAndCenter(next, [center.lng, center.lat], false, 300);
  },
  panTo(center) {
    // 只平移不动缩放：统计列表里挑一条时看的是「它在哪」，保持当前视野尺度
    draftMoveGraceUntil = performance.now() + PROGRAMMATIC_MOVE_GRACE;
    map.value?.panTo([center.lng, center.lat], 320);
  },
  clearDraft() {
    clearDraft();
  },
  fitTo(places) {
    if (!map.value || !AMap || !places.length) return;
    const overlays = places.map((place) => new AMap.Marker({ position: [place.lng, place.lat] }));
    map.value.setFitView(overlays, false, [90, 90, 90, 90]);
  },
  getCenter() {
    const center = map.value?.getCenter();
    return center ? { lng: center.getLng(), lat: center.getLat() } : null;
  },
  getZoom() {
    return map.value?.getZoom() ?? props.initialView.zoom;
  },
  refresh() {
    rebuildMarkers();
  },
  resize() {
    map.value?.resize?.();
  },
});
</script>

<template>
  <div class="amap-shell">
    <div ref="host" class="amap-host" :class="{ 'labels-on': labelsOn }" />
    <div class="crosshair" aria-hidden="true" />
    <div v-if="error" class="amap-error">
      <p>{{ error }}</p>
    </div>
    <div v-else-if="!ready" class="amap-loading">地图加载中…</div>
  </div>
</template>
