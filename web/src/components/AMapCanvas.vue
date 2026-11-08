<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { loadAMap } from '../lib/amap.ts';
import { shortName } from '../lib/format.ts';
import type { AppConfig, FilterKind, MapApi, MapViewport, Place } from '../lib/types.ts';
import { iconPaths } from '../lib/icons.ts';

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
let markers: any[] = [];
let circle: any = null;
let clusterTimer: ReturnType<typeof setTimeout> | null = null;

const GRID = 60;
const MAX_CLUSTER_ZOOM = 16;

const visiblePlaces = computed(() =>
  props.filter === 'all' ? props.places : props.places.filter((place) => place.type === props.filter),
);

const highlight = computed(() => new Set(props.highlightAdcodes));

function clearMarkers(): void {
  if (map.value && markers.length) map.value.remove(markers);
  markers = [];
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

function makePin(place: Place): HTMLDivElement {
  const element = document.createElement('div');
  element.className = `pin-marker pin-marker--${place.type}`;
  if (highlight.value.size) {
    element.classList.add(highlight.value.has(place.cityAdcode ?? '') ? 'is-highlight' : 'is-dim');
  }
  const glyph = place.type === 'restaurant' ? iconPaths('bowl') : iconPaths('camera');
  element.innerHTML =
    `<span class="pin-dot"><svg class="pin-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
    `stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${glyph}</svg></span>` +
    `<span class="pin-label">${escapeHtml(shortName(place.name))}</span>`;
  element.title = place.name;
  element.addEventListener('click', (event) => {
    event.stopPropagation();
    emit('markerClick', place.id);
  });
  return element;
}

function makeCluster(group: { x: number; y: number; places: Place[] }): HTMLDivElement {
  const element = document.createElement('div');
  element.className = 'pin-cluster';
  element.innerHTML = `<span>${group.places.length}</span>`;
  element.title = `${group.places.length} 个地点`;
  element.addEventListener('click', (event) => {
    event.stopPropagation();
    const current = map.value?.getZoom() ?? zoom.value;
    const next = Math.min(MAX_CLUSTER_ZOOM, Math.max(current + 2, 14));
    const lng = group.places.reduce((total, place) => total + place.lng, 0) / group.places.length;
    const lat = group.places.reduce((total, place) => total + place.lat, 0) / group.places.length;
    map.value?.setZoomAndCenter(next, [lng, lat]);
  });
  return element;
}

function rebuildMarkers(): void {
  const instance = map.value;
  if (!instance || !AMap) return;
  clearMarkers();

  for (const group of clusterPoints()) {
    if (group.places.length === 1) {
      const place = group.places[0] as Place;
      const marker = new AMap.Marker({
        position: [place.lng, place.lat],
        content: makePin(place),
        anchor: 'bottom-center',
        offset: new AMap.Pixel(0, 0),
        zIndex: 120,
      });
      markers.push(marker);
    } else {
      const lng = group.places.reduce((total, place) => total + place.lng, 0) / group.places.length;
      const lat = group.places.reduce((total, place) => total + place.lat, 0) / group.places.length;
      const marker = new AMap.Marker({
        position: [lng, lat],
        content: makeCluster(group),
        anchor: 'center',
        zIndex: 130,
      });
      markers.push(marker);
    }
  }
  instance.add(markers);
}

function scheduleRebuild(): void {
  if (clusterTimer) clearTimeout(clusterTimer);
  clusterTimer = setTimeout(() => {
    clusterTimer = null;
    rebuildMarkers();
  }, 60);
}

function syncLabels(): void {
  const current = map.value?.getZoom() ?? 0;
  zoom.value = current;
  labelsOn.value = current >= 13;
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

onMounted(async () => {
  try {
    AMap = await loadAMap(props.config);
  } catch (loadError) {
    error.value = (loadError as Error).message;
    return;
  }
  if (!host.value) return;

  const instance = new AMap.Map(host.value, {
    zoom: props.initialView.zoom,
    center: [props.initialView.lng, props.initialView.lat],
    viewMode: '2D',
    resizeEnable: true,
    zooms: [3, 18],
  });
  map.value = instance;
  ready.value = true;

  instance.on('complete', () => {
    rebuildMarkers();
    syncLabels();
    syncCircle();
    emitView();
  });
  instance.on('zoomend', () => {
    syncLabels();
    scheduleRebuild();
    syncCircle();
    emitView();
  });
  instance.on('moveend', () => {
    scheduleRebuild();
    syncCircle();
    emitView();
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
  },
});

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return map[char] ?? char;
  });
}
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
