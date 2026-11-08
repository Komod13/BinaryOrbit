<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { forceDomRenderer, installMapTint, loadAMap, mapFeatureOptions, mapRenderOptions } from '../lib/amap.ts';
import { diagState } from '../lib/diag.ts';
import { shortName } from '../lib/format.ts';
import type { AppConfig, FilterKind, MapApi, MapViewport, Place } from '../lib/types.ts';
import burgerIcon from '../assets/icons/burger.png';
import cameraIcon from '../assets/icons/camera.png';

const props = withDefaults(
  defineProps<{
    config: AppConfig;
    initialView: MapViewport;
    places: Place[];
    filter: FilterKind;
    highlightAdcodes?: string[];
    radius?: number | null;
  }>(),
  { highlightAdcodes: () => [], radius: null },
);

const emit = defineEmits<{
  markerClick: [id: number];
  viewChange: [view: MapViewport];
}>();

const host = ref<HTMLDivElement | null>(null);
const error = ref('');
const ready = ref(false);
const labelsOn = ref(false);
const zoom = ref(props.initialView.zoom);

const map = shallowRef<any>(null);
let AMap: any = null;
let circle: any = null;
let clusterTimer: ReturnType<typeof setTimeout> | null = null;
// 手势进行中不做聚合重建：iOS/WKWebView 上删除+重建几十个 DOM 标记会直接卡住一帧以上
let interacting = false;
let pendingRebuild = false;

interface MarkerSlot {
  marker: any;
  kind: 'pin' | 'cluster';
  el: HTMLDivElement;
}

let slots: MarkerSlot[] = [];

const GRID = 60;
const MAX_CLUSTER_ZOOM = 16;

const visiblePlaces = computed(() =>
  props.filter === 'all' ? props.places : props.places.filter((place) => place.type === props.filter),
);

const highlight = computed(() => new Set(props.highlightAdcodes));

function clearMarkers(): void {
  if (map.value && slots.length) map.value.remove(slots.map((slot) => slot.marker));
  slots = [];
}

function clusterPoints(): { x: number; y: number; places: Place[] }[] {
  const instance = map.value;
  if (!instance) return [];
  const cells = new Map<string, { x: number; y: number; places: Place[] }>();
  for (const place of visiblePlaces.value) {
    const pixel = instance.lngLatToContainer([place.lng, place.lat]);
    if (!pixel) continue;
    const key = `${Math.floor(pixel.x / GRID)}:${Math.floor(pixel.y / GRID)}`;
    const cell = cells.get(key);
    if (cell) cell.places.push(place);
    else cells.set(key, { x: pixel.x, y: pixel.y, places: [place] });
  }
  return [...cells.values()];
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
    const next = Math.min(MAX_CLUSTER_ZOOM, Math.max(current + 2, 14));
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
    let slot = slots[used];
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

function emitView(): void {
  const instance = map.value;
  if (!instance) return;
  const center = instance.getCenter();
  emit('viewChange', { lng: center.getLng(), lat: center.getLat(), zoom: instance.getZoom() });
}

/**
 * 触屏设备上不再给瓦片层套 CSS 滤镜（每帧都要整屏重算，iPad 上平移缩放会明显掉帧），
 * 改成在瓦片层上方插一张静态色纱；桌面端仍由 CSS 媒体查询套滤镜。
 */
function ensureTint(): void {
  installMapTint(host.value);
}

onMounted(async () => {
  try {
    AMap = await loadAMap(props.config);
  } catch (loadError) {
    error.value = (loadError as Error).message;
    return;
  }
  if (!host.value) return;

  const renderOptions = mapRenderOptions();
  const featureOptions = mapFeatureOptions(renderOptions);
  const domForced = renderOptions.forceDom && forceDomRenderer(AMap);
  diagState.mapOptions =
    `${featureOptions.features.join('+')}${featureOptions.showLabel ? '+labels' : ''}` +
    `${renderOptions.lowRes ? '+1x' : ''}${domForced ? '+dom' : ''}`;
  const instance = new AMap.Map(host.value, {
    zoom: props.initialView.zoom,
    center: [props.initialView.lng, props.initialView.lat],
    viewMode: '2D',
    // 2D 地图不需要旋转 / 俯仰：iPad 上两指缩放时很容易带到旋转，画面一歪就显得很卡
    rotateEnable: false,
    pitchEnable: false,
    resizeEnable: true,
    zooms: [3, 18],
    // 底图要素开关（?lean / ?labels=0 / ?nopoint / ?nobuilding）：用来在 iPad 上做卡顿二分
    features: featureOptions.features,
    showLabel: featureOptions.showLabel,
    showBuildingBlock: !renderOptions.noBuilding && !renderOptions.lean,
  });
  map.value = instance;
  ready.value = true;

  instance.on('complete', () => {
    ensureTint();
    rebuildMarkers();
    syncLabels();
    syncCircle();
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
  });
  instance.on('zoomstart', () => {
    interacting = true;
  });
  instance.on('zoomend', () => {
    syncLabels();
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
});

watch(() => [props.places, props.filter, props.highlightAdcodes], () => scheduleRebuild(), { deep: false });
watch(() => props.radius, () => syncCircle());

onBeforeUnmount(() => {
  clearMarkers();
  if (clusterTimer) clearTimeout(clusterTimer);
  map.value?.destroy?.();
  map.value = null;
});

defineExpose<MapApi>({
  setView(center, level) {
    map.value?.setZoomAndCenter(level ?? 13, [center.lng, center.lat]);
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
    ensureTint();
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
