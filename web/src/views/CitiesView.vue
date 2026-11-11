<script setup lang="ts">
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, shallowRef, watch } from 'vue';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { useRouter } from 'vue-router';
import Icon from '../components/Icon.vue';
import SideSheet from '../components/SideSheet.vue';
import { fetchCities, fetchCitiesGeo, fetchConfig, markCity, qk, unmarkCity } from '../lib/queries.ts';
import { CHINA_VIEW, loadAMap } from '../lib/amap.ts';
import { STORAGE_KEYS, readStorage, writeStorage } from '../lib/storage.ts';
import { toast, toastError } from '../lib/toast.ts';
import type { AppConfig, CityStat, MapViewport } from '../lib/types.ts';

defineOptions({ name: 'CitiesView' });

const router = useRouter();
const queryClient = useQueryClient();

const host = ref<HTMLDivElement | null>(null);
const config = ref<AppConfig | null>(null);
const error = ref('');
const ready = ref(false);
const activeCity = ref<CityStat | { adcode: string; name: string; unlit: true } | null>(null);
const zoomedOut = ref(true);
// keep-alive 下切到其他 Tab 时暂停边界轮询，回来再继续
const pageActive = ref(true);

/** 边界轮询退避：2s → 30s，最多 24 次，避免某省永久失败时无限打服务 */
const GEO_POLL_MIN_MS = 2000;
const GEO_POLL_MAX_MS = 30_000;
const GEO_POLL_LIMIT = 24;
const geoAttempts = ref(0);
// 已经拿到的省份：轮询时只让服务端下发新增边界，避免每次重复传几 MB
const loadedProvinces = ref<string[]>([]);

const map = shallowRef<any>(null);
let AMap: any = null;
let geojsonLayers: any[] = [];
let labelMarkers: any[] = [];
let routeLine: any = null;
let labelsSignature = '';
let styleSignature = '';
const polygons = new Map<string, any>();
const rendered = new Set<string>();

const citiesQuery = useQuery({
  queryKey: qk.cities,
  queryFn: fetchCities,
  enabled: computed(() => config.value !== null),
});

const geoQuery = useQuery({
  queryKey: qk.citiesGeo,
  queryFn: async () => {
    geoAttempts.value += 1;
    return fetchCitiesGeo(loadedProvinces.value);
  },
  enabled: computed(() => pageActive.value && config.value !== null),
  refetchInterval: (query) => {
    const data = query.state.data as { missing?: string[] } | undefined;
    if (!data?.missing?.length || geoAttempts.value >= GEO_POLL_LIMIT) return false;
    return Math.min(GEO_POLL_MAX_MS, GEO_POLL_MIN_MS * Math.max(1, geoAttempts.value));
  },
});

const cities = computed<CityStat[]>(() => citiesQuery.data.value ?? []);
const visitedMap = computed(() => new Map(cities.value.map((city) => [city.adcode, city])));

const progress = computed(() => {
  const data = geoQuery.data.value;
  if (!data || !data.missing.length) return '';
  const done = data.loaded.length;
  if (geoAttempts.value >= GEO_POLL_LIMIT) {
    return `部分城市边界加载失败（${done}/${data.total}），切到标记页再回来会重试`;
  }
  return `正在加载城市边界 ${done}/${data.total}`;
});

const totals = computed(() => ({
  cities: cities.value.length,
  places: cities.value.reduce((sum, city) => sum + city.restaurantCount + city.spotCount, 0),
}));

function styleFor(adcode: string) {
  const visited = visitedMap.value.get(adcode);
  if (visited) {
    return {
      strokeColor: '#8a3d8a',
      strokeWeight: 2,
      strokeOpacity: 1,
      fillColor: '#c9a1c8',
      fillOpacity: 0.35,
      zIndex: 20,
      bubble: true,
    };
  }
  return {
    strokeColor: '#cbcdc4',
    strokeWeight: 0.6,
    strokeOpacity: 0.45,
    fillColor: '#ffffff',
    fillOpacity: 0.03,
    zIndex: 10,
    bubble: true,
  };
}

function paint(): void {
  for (const [adcode, polygon] of polygons) {
    polygon.setOptions(styleFor(adcode));
    const visited = visitedMap.value.get(adcode);
    polygon.setOptions({ zIndex: visited ? 20 : 10 });
  }
}

function renderFeatures(): void {
  const instance = map.value;
  const data = geoQuery.data.value;
  if (!instance || !AMap || !data) return;

  const pending = data.geojson.features.filter((feature) => !rendered.has(feature.properties.adcode));
  if (pending.length) {
    const layer = new AMap.GeoJSON({
      geoJSON: { type: 'FeatureCollection', features: pending },
      getPolygon: (feature: { properties: { adcode: string; name: string } }, rings: unknown) => {
        const adcode = feature.properties.adcode;
        const polygon = new AMap.Polygon({ path: rings, ...styleFor(adcode) });
        polygon.on('click', () => openCity(adcode, feature.properties.name));
        polygon.on('mouseover', () =>
          polygon.setOptions({
            fillOpacity: visitedMap.value.get(adcode) ? 0.4 : 0.12,
            strokeColor: '#8a658a',
            strokeWeight: 1.6,
          }),
        );
        polygon.on('mouseout', () => polygon.setOptions(styleFor(adcode)));
        polygons.set(adcode, polygon);
        rendered.add(adcode);
        return polygon;
      },
    });
    instance.add(layer);
    geojsonLayers.push(layer);
  }

  // 这批要素已经进图层，下一轮只让服务端下发新增省份
  // （地图还没就绪时上面的 guard 会提前返回，此刻不会误标为已加载）
  loadedProvinces.value = data.loaded;

  // 只有「哪些城市已点亮」变化时才重刷多边形样式；新增轮廓构造时已经带好样式
  const visitedKey = cities.value.map((city) => city.adcode).join(',');
  if (visitedKey !== styleSignature) {
    styleSignature = visitedKey;
    paint();
  }

  // 城市没变时不需要把所有标签和航线删了重建
  const key = labelsKey();
  if (key !== labelsSignature) {
    labelsSignature = key;
    renderLabels();
    renderRoute();
  }
}

/** 城市标签/航线是否真的需要重建：城市数据或它的可用中心坐标变了才变 */
function labelsKey(): string {
  return JSON.stringify(
    cities.value.map((city) => {
      const center = cityCenter(city.adcode);
      return [
        city.adcode,
        city.name,
        city.restaurantCount,
        city.spotCount,
        city.manual ? 1 : 0,
        city.firstVisitedOn ?? '',
        city.lastVisitedOn ?? '',
        center ? `${center.lng},${center.lat}` : '',
      ];
    }),
  );
}

function cityCenter(adcode: string): { lng: number; lat: number } | null {
  const city = visitedMap.value.get(adcode);
  if (
    city &&
    city.lng !== null &&
    city.lat !== null &&
    Number.isFinite(city.lng) &&
    Number.isFinite(city.lat)
  ) {
    return { lng: city.lng, lat: city.lat };
  }
  const polygon = polygons.get(adcode);
  if (!polygon) return null;
  const bounds = polygon.getBounds?.();
  const center = bounds?.getCenter?.();
  return center ? { lng: center.getLng(), lat: center.getLat() } : null;
}

function clearLabels(): void {
  if (map.value && labelMarkers.length) map.value.remove(labelMarkers);
  labelMarkers = [];
}

function labelMeta(city: CityStat): string {
  const total = city.restaurantCount + city.spotCount;
  return total === 0 ? '补标' : `餐厅 ${city.restaurantCount} · 景点 ${city.spotCount}`;
}

function renderLabels(): void {
  const instance = map.value;
  if (!instance || !AMap) return;
  clearLabels();
  for (const city of cities.value) {
    const position = cityCenter(city.adcode);
    if (!position) continue;
    const element = document.createElement('div');
    element.className = 'city-label';
    // 城市名可能来自 /api/cities/manual 的用户输入，必须用 textContent，不能拼 innerHTML
    const dot = document.createElement('span');
    dot.className = 'city-dot';
    const label = document.createElement('span');
    label.className = 'city-label-name';
    label.textContent = city.name;
    const meta = document.createElement('span');
    meta.className = 'city-label-meta';
    meta.textContent = labelMeta(city);
    element.append(dot, label, meta);
    element.tabIndex = 0;
    element.setAttribute('role', 'button');
    element.setAttribute('aria-label', `${city.name}，${labelMeta(city)}`);
    const open = (): void => openCity(city.adcode, city.name);
    element.addEventListener('click', (event) => {
      event.stopPropagation();
      open();
    });
    element.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      event.stopPropagation();
      open();
    });
    labelMarkers.push(
      new AMap.Marker({ position: [position.lng, position.lat], content: element, anchor: 'center', zIndex: 200 }),
    );
  }
  if (labelMarkers.length) instance.add(labelMarkers);
}

function renderRoute(): void {
  const instance = map.value;
  if (!instance || !AMap) return;
  if (routeLine) {
    instance.remove(routeLine);
    routeLine = null;
  }
  const ordered = [...cities.value].sort((a, b) =>
    String(a.firstVisitedOn ?? '').localeCompare(String(b.firstVisitedOn ?? '')),
  );
  const path = ordered
    .map((city) => cityCenter(city.adcode))
    .filter((point): point is { lng: number; lat: number } => point !== null)
    .map((point) => [point.lng, point.lat]);
  if (path.length < 2) return;
  routeLine = new AMap.Polyline({
    path,
    strokeColor: '#b487b3',
    strokeOpacity: 0.55,
    strokeWeight: 1.8,
    strokeStyle: 'dashed',
    strokeDasharray: [4, 7],
    zIndex: 15,
    bubble: true,
  });
  instance.add(routeLine);
}

function openCity(adcode: string, name: string): void {
  const city = visitedMap.value.get(adcode);
  activeCity.value = city ?? { adcode, name, unlit: true };
  const center = cityCenter(adcode);
  if (center) map.value?.setZoomAndCenter(Math.max(map.value?.getZoom() ?? 4, 6), [center.lng, center.lat]);
}

async function lightCity(): Promise<void> {
  const target = activeCity.value;
  if (!target) return;
  try {
    await markCity(target.adcode, target.name);
    toast(`已点亮「${target.name}」`);
    activeCity.value = null;
    await queryClient.invalidateQueries({ queryKey: qk.cities });
    await queryClient.invalidateQueries({ queryKey: qk.stats });
  } catch (lightError) {
    toastError(lightError);
  }
}

async function unmark(): Promise<void> {
  const target = activeCity.value;
  if (!target) return;
  try {
    await unmarkCity(target.adcode);
    toast(`已取消「${target.name}」的补标`);
    activeCity.value = null;
    await queryClient.invalidateQueries({ queryKey: qk.cities });
    await queryClient.invalidateQueries({ queryKey: qk.stats });
  } catch (unmarkError) {
    toastError(unmarkError);
  }
}

function goMap(): void {
  const target = activeCity.value;
  if (!target) return;
  activeCity.value = null;
  void router.push({ path: '/map', query: { city: target.adcode } });
}

let viewTimer: ReturnType<typeof setTimeout> | null = null;
function saveView(): void {
  const instance = map.value;
  if (!instance) return;
  if (viewTimer) clearTimeout(viewTimer);
  viewTimer = setTimeout(() => {
    const center = instance.getCenter();
    writeStorage(STORAGE_KEYS.citiesView, {
      lng: center.getLng(),
      lat: center.getLat(),
      zoom: instance.getZoom(),
    } satisfies MapViewport);
  }, 400);
}

/** zoom < 5 时城市标签只留名字，收起「餐厅 N · 景点 M」副行（见 DESIGN.md §3.3） */
function syncZoomState(): void {
  zoomedOut.value = (map.value?.getZoom() ?? 4) < 5;
}

watch([() => geoQuery.data.value, () => citiesQuery.data.value], () => renderFeatures());

// keep-alive：切到标记页时停掉城市边界轮询，避免后台每 2s 重复拉全量 GeoJSON
// 回到本页时重置退避计数，给失败过的省份一次新的重试窗口
onActivated(() => {
  pageActive.value = true;
  geoAttempts.value = 0;
});
onDeactivated(() => {
  pageActive.value = false;
});

onMounted(async () => {
  try {
    config.value = await queryClient.fetchQuery({
      queryKey: qk.config,
      queryFn: fetchConfig,
      staleTime: Infinity,
    });
    if (!config.value) throw new Error('配置缺失');
    AMap = await loadAMap(config.value);
  } catch (loadError) {
    error.value = (loadError as Error).message;
    return;
  }
  if (!host.value) return;

  const saved = readStorage<MapViewport | null>(STORAGE_KEYS.citiesView, null);
  // 宽屏用 zoom 5 让全国填满视口，窄屏用 4
  const defaultZoom = window.innerWidth >= 1100 ? 5 : 4;
  const valid =
    saved &&
    Number.isFinite(saved.lng) &&
    Number.isFinite(saved.lat) &&
    Number.isFinite(saved.zoom) &&
    saved.zoom > 0;
  const view = valid ? saved : { ...CHINA_VIEW, zoom: defaultZoom };
  const instance = new AMap.Map(host.value, {
    zoom: view.zoom,
    center: [view.lng, view.lat],
    viewMode: '2D',
    zooms: [3, 12],
    resizeEnable: true,
  });
  map.value = instance;
  ready.value = true;
  syncZoomState();

  instance.on('complete', () => {
    syncZoomState();
    renderFeatures();
  });
  instance.on('moveend', saveView);
  instance.on('zoomend', () => {
    syncZoomState();
    saveView();
  });
});

onBeforeUnmount(() => {
  clearLabels();
  if (viewTimer) clearTimeout(viewTimer);
  map.value?.destroy?.();
  map.value = null;
});
</script>

<template>
  <section class="surface cities-surface" aria-label="城市">
    <div class="cities-head">
      <p class="eyebrow">城市</p>
      <h1 class="cities-title">走过的城市</h1>
      <p class="cities-sub">
        <b>{{ totals.cities }}</b> 座城市 <span>·</span> <b>{{ totals.places }}</b> 处地点
      </p>
      <p v-if="progress" class="cities-progress">{{ progress }}</p>
    </div>

    <div ref="host" class="cities-canvas" :class="{ 'cities-zoomed-out': zoomedOut }" />
    <div v-if="error" class="amap-error">{{ error }}</div>
    <div v-else-if="!ready" class="map-placeholder">地图加载中…</div>

    <SideSheet :open="activeCity !== null" label="城市详情" labelled-by="city-sheet-title" @close="activeCity = null">
      <div v-if="activeCity" class="panel">
        <div class="sheet-head">
          <span class="tag tag--quiet">城市</span>
          <button class="icon-btn" type="button" aria-label="关闭" @click="activeCity = null">
            <Icon name="close" :size="18" />
          </button>
        </div>
        <h2 class="sheet-title" id="city-sheet-title">{{ activeCity.name }}</h2>

        <template v-if="'unlit' in activeCity">
          <p class="sheet-sub">还没有点亮这座城市</p>
          <p class="note-line">
            点亮后会计入城市总数。之后也可以再补上具体的地点，点亮不依赖地点记录。
          </p>
          <div class="sheet-actions">
            <button class="btn btn--primary" type="button" @click="lightCity">
              <Icon name="pin" :size="17" />点亮
            </button>
            <button class="btn btn--ghost" type="button" @click="activeCity = null">取消</button>
          </div>
        </template>

        <template v-else>
          <p class="sheet-sub">
            {{
              activeCity.lastVisitedOn
                ? `最近一次 ${activeCity.lastVisitedOn}`
                : activeCity.manual
                  ? '补标城市 · 暂无地点记录'
                  : '还没有到访记录'
            }}
          </p>
          <div class="facts">
            <div class="fact od-stat">
              <span class="fact-num">{{ activeCity.restaurantCount }}</span>
              <span class="fact-label">餐厅</span>
            </div>
            <div class="fact od-stat">
              <span class="fact-num">{{ activeCity.spotCount }}</span>
              <span class="fact-label">景点</span>
            </div>
            <div class="fact od-stat">
              <span class="fact-num">{{ activeCity.restaurantCount + activeCity.spotCount }}</span>
              <span class="fact-label">地点</span>
            </div>
          </div>
          <div class="sheet-actions">
            <button class="btn btn--primary" type="button" @click="goMap">
              <Icon name="map" :size="17" />在地图上查看
            </button>
            <button v-if="activeCity.manual" class="btn btn--ghost" type="button" @click="unmark">
              取消补标
            </button>
            <button class="btn btn--ghost" type="button" @click="activeCity = null">关闭</button>
          </div>
        </template>
      </div>
    </SideSheet>
  </section>
</template>
