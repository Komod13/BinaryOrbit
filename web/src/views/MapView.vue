<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { useRoute } from 'vue-router';
import AMapCanvas from '../components/AMapCanvas.vue';
import MapDock from '../components/MapDock.vue';
import SideSheet from '../components/SideSheet.vue';
import SearchPanel from '../components/SearchPanel.vue';
import PlaceDetailPanel from '../components/PlaceDetailPanel.vue';
import PlaceFormPanel from '../components/PlaceFormPanel.vue';
import { fetchConfig, fetchPlaces, fetchRegeo, qk } from '../lib/queries.ts';
import { CHINA_VIEW, viewportFromIp } from '../lib/amap.ts';
import { STORAGE_KEYS, readStorage, writeStorage } from '../lib/storage.ts';
import { toastError } from '../lib/toast.ts';
import type { AppConfig, FilterKind, MapViewport, Place, PoiResult } from '../lib/types.ts';

defineOptions({ name: 'MapView' });

type DrawerState =
  | { mode: 'none' }
  | { mode: 'search' }
  | { mode: 'detail'; placeId: number }
  | { mode: 'form-new'; poi: PoiResult | null; presetName: string }
  | { mode: 'form-visit'; place: Place };

const route = useRoute();
const queryClient = useQueryClient();

const config = ref<AppConfig | null>(null);
const initialView = ref<MapViewport | null>(null);
const mapRef = ref<InstanceType<typeof AMapCanvas> | null>(null);

const filter = ref<FilterKind>(readStorage<FilterKind>(STORAGE_KEYS.filter, 'all'));
const drawer = ref<DrawerState>({ mode: 'none' });
const radius = ref(1000);
const center = ref<{ lng: number; lat: number } | null>(null);
const cityScope = ref<'city' | 'nation'>('city');
const centerCity = ref<string | null>(null);
const resolvingCity = ref(false);

const placesQuery = useQuery({
  queryKey: computed(() => qk.places()),
  queryFn: () => fetchPlaces(),
  enabled: computed(() => config.value !== null),
  staleTime: 30_000,
});

const places = computed(() => placesQuery.data.value ?? []);
const placesLoaded = computed(() => placesQuery.isSuccess.value);

const drawerOpen = computed(() => drawer.value.mode !== 'none');
const searchRadius = computed(() => (drawer.value.mode === 'search' ? radius.value : null));

const detailId = computed(() => (drawer.value.mode === 'detail' ? drawer.value.placeId : null));

const highlight = computed<string[]>(() => {
  const city = route.query.city;
  return typeof city === 'string' ? [city] : [];
});

watch(filter, (value) => writeStorage(STORAGE_KEYS.filter, value));
watch(places, () => {
  if (drawer.value.mode !== 'none' || highlight.value.length) return;
  if (!placesLoaded.value) return;
  if (!places.value.length && !centerCity.value) void probeCity(true);
});

let moveTimer: ReturnType<typeof setTimeout> | null = null;
let lastProbe = { lng: 0, lat: 0 };
function onViewChange(view: MapViewport): void {
  center.value = { lng: view.lng, lat: view.lat };
  writeStorage(STORAGE_KEYS.mapView, view);
  if (moveTimer) clearTimeout(moveTimer);
  moveTimer = setTimeout(() => {
    if (cityScope.value !== 'city') return;
    const moved = Math.abs(view.lng - lastProbe.lng) > 0.05 || Math.abs(view.lat - lastProbe.lat) > 0.05;
    if (moved || !centerCity.value) void probeCity();
  }, 700);
}

async function probeCity(force = false): Promise<void> {
  if (resolvingCity.value || !center.value) return;
  if (!force && centerCity.value) return;
  resolvingCity.value = true;
  lastProbe = { ...center.value };
  try {
    const regeo = await fetchRegeo(center.value.lng, center.value.lat);
    centerCity.value = regeo.cityName;
  } catch {
    /* 定位失败就保持「全国」 */
  } finally {
    resolvingCity.value = false;
  }
}

function openDetail(placeId: number): void {
  drawer.value = { mode: 'detail', placeId };
}

function onSearchPick(poi: PoiResult): void {
  if (poi.existingPlaceId) {
    const existing = places.value.find((place) => place.id === poi.existingPlaceId);
    if (existing) {
      drawer.value = { mode: 'form-visit', place: existing };
      return;
    }
    openDetail(poi.existingPlaceId);
    return;
  }
  drawer.value = { mode: 'form-new', poi, presetName: '' };
}

function onManualAdd(name: string): void {
  drawer.value = { mode: 'form-new', poi: null, presetName: name };
}

// 移动端打开「搜索附近」时把地图容器缩到抽屉上方，让准星与半径圈保持可见
const searching = computed(() => drawer.value.mode === 'search');
watch(searching, async () => {
  await nextTick();
  setTimeout(() => mapRef.value?.resize(), 260);
});

function closeDrawer(): void {
  drawer.value = { mode: 'none' };
}

function onSaved(): void {
  closeDrawer();
  void queryClient.invalidateQueries({ queryKey: ['places'] });
}

function focusCity(adcode: string): void {
  const targets = places.value.filter((place) => place.cityAdcode === adcode);
  if (targets.length) mapRef.value?.fitTo(targets);
}

watch(
  () => [highlight.value.join(','), places.value.length] as const,
  () => {
    const adcode = highlight.value[0];
    if (adcode && places.value.length) focusCity(adcode);
  },
);

onMounted(async () => {
  try {
    config.value = await queryClient.fetchQuery({
      queryKey: qk.config,
      queryFn: fetchConfig,
      staleTime: Infinity,
    });
  } catch (error) {
    toastError(error);
    return;
  }

  const saved = readStorage<MapViewport | null>(STORAGE_KEYS.mapView, null);
  if (saved && Number.isFinite(saved.lng) && Number.isFinite(saved.lat)) {
    initialView.value = saved;
    return;
  }
  // 没有历史视野时：有数据就框住全部地点，没有就按 IP 定位到省份
  try {
    const rows = await queryClient.fetchQuery({
      queryKey: qk.places(),
      queryFn: () => fetchPlaces(),
      staleTime: 30_000,
    });
    if (rows.length) {
      initialView.value = boundsView(rows);
      return;
    }
  } catch {
    /* 取不到列表就退回 IP 定位 */
  }

  const guessed = await viewportFromIp(config.value);
  initialView.value = guessed ?? CHINA_VIEW;
});

/** 用所有地点的包围盒算一个合适的初始视野 */
function boundsView(rows: Place[]): MapViewport {
  const lngs = rows.map((place) => place.lng);
  const lats = rows.map((place) => place.lat);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const span = Math.max(maxLng - minLng, maxLat - minLat);
  const zoom = span > 20 ? 4 : span > 8 ? 5 : span > 3 ? 6 : span > 1.2 ? 8 : span > 0.4 ? 10 : 12;
  return {
    lng: (minLng + maxLng) / 2,
    lat: (minLat + maxLat) / 2,
    zoom,
  };
}

onBeforeUnmount(() => {
  if (moveTimer) clearTimeout(moveTimer);
});

const showEmptyHint = computed(
  () => placesLoaded.value && places.value.length === 0 && drawer.value.mode === 'none',
);
</script>

<template>
  <section class="surface map-surface" :class="{ 'is-searching': searching }" aria-label="地图">
    <AMapCanvas
      v-if="config && initialView"
      ref="mapRef"
      :config="config"
      :initial-view="initialView"
      :places="places"
      :filter="filter"
      :highlight-adcodes="highlight"
      :radius="searchRadius"
      @marker-click="openDetail"
      @view-change="onViewChange"
    />
    <div v-else-if="!config" class="map-placeholder">正在准备地图…</div>

    <div v-if="showEmptyHint" class="map-empty-hint">
      <p>还没有记录任何地点</p>
      <p class="map-empty-sub">把地图拖到店门口，点「搜索附近」开始记录。</p>
    </div>

    <MapDock
      :places="places"
      :filter="filter"
      :city-name="centerCity"
      :city-scope="cityScope"
      :resolving-city="resolvingCity"
      @update:filter="filter = $event"
      @update:city-scope="cityScope = $event"
      @open-place="openDetail"
      @open-poi="onSearchPick"
      @manual="onManualAdd"
      @nearby="drawer = { mode: 'search' }"
      @focus-search="probeCity()"
    />

    <SideSheet :open="drawerOpen" :compact="drawer.mode === 'search'" @close="closeDrawer">
      <SearchPanel
        v-if="drawer.mode === 'search' && center"
        :center="center"
        :filter="filter"
        :radius="radius"
        @update:radius="radius = $event"
        @pick="onSearchPick"
        @manual="onManualAdd"
        @close="closeDrawer"
      />
      <PlaceDetailPanel
        v-else-if="detailId !== null"
        :place-id="detailId"
        :tiers="config?.priceTiers ?? { low: 60, high: 150 }"
        @again="drawer = { mode: 'form-visit', place: $event }"
        @deleted="closeDrawer"
        @close="closeDrawer"
      />
      <PlaceFormPanel
        v-else-if="drawer.mode === 'form-new' || drawer.mode === 'form-visit'"
        :tiers="config?.priceTiers ?? { low: 60, high: 150 }"
        :mode="drawer.mode === 'form-new' ? 'new' : 'visit'"
        :poi="drawer.mode === 'form-new' ? drawer.poi : null"
        :place="drawer.mode === 'form-visit' ? drawer.place : null"
        :preset-name="drawer.mode === 'form-new' ? drawer.presetName : ''"
        :center="center ?? { lng: CHINA_VIEW.lng, lat: CHINA_VIEW.lat }"
        :places="places"
        @saved="onSaved"
        @close="closeDrawer"
      />
    </SideSheet>
  </section>
</template>
