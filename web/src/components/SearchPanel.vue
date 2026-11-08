<script setup lang="ts">
import { computed, ref } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import Icon from './Icon.vue';
import { qk, searchAround, searchText } from '../lib/queries.ts';
import { categoryLabel, distanceLabel, TYPE_LABEL } from '../lib/format.ts';
import type { FilterKind, PlaceType, PoiResult } from '../lib/types.ts';

const props = defineProps<{
  center: { lng: number; lat: number };
  filter: FilterKind;
  radius: number;
}>();

const emit = defineEmits<{
  pick: [poi: PoiResult];
  manual: [name: string];
  close: [];
  "update:radius": [value: number];
}>();

const RADIUS_OPTIONS = [500, 1000, 3000];
const keyword = ref('');
const query = ref('');

const activeType = computed<PlaceType | undefined>(() =>
  props.filter === 'all' ? undefined : props.filter,
);

const nearbyRestaurant = useQuery({
  queryKey: computed(() =>
    qk.searchAround(props.center.lng, props.center.lat, props.radius, activeType.value ?? 'restaurant'),
  ),
  queryFn: () =>
    searchAround(props.center.lng, props.center.lat, props.radius, activeType.value ?? 'restaurant'),
  enabled: computed(() => activeType.value === undefined || activeType.value === 'restaurant'),
  staleTime: 30_000,
});

const nearbySpot = useQuery({
  queryKey: computed(() =>
    qk.searchAround(props.center.lng, props.center.lat, props.radius, activeType.value ?? 'spot'),
  ),
  queryFn: () => searchAround(props.center.lng, props.center.lat, props.radius, activeType.value ?? 'spot'),
  enabled: computed(() => activeType.value === undefined || activeType.value === 'spot'),
  staleTime: 30_000,
});

const textSearch = useQuery({
  queryKey: computed(() => qk.searchText(query.value, activeType.value, undefined)),
  queryFn: () => searchText(query.value, activeType.value, undefined),
  enabled: computed(() => query.value.length > 0),
  staleTime: 60_000,
});

const loading = computed(
  () => nearbyRestaurant.isFetching.value || nearbySpot.isFetching.value || textSearch.isFetching.value,
);

const results = computed<PoiResult[]>(() => {
  if (query.value) return textSearch.data.value?.results ?? [];
  const rows = [
    ...(nearbyRestaurant.data.value?.results ?? []),
    ...(nearbySpot.data.value?.results ?? []),
  ];
  return rows
    .filter((poi) => !activeType.value || poi.type === activeType.value)
    .sort((a, b) => (a.distance ?? Number.MAX_SAFE_INTEGER) - (b.distance ?? Number.MAX_SAFE_INTEGER));
});

function search(): void {
  query.value = keyword.value.trim();
}

function reset(): void {
  keyword.value = '';
  query.value = '';
}

function pick(poi: PoiResult): void {
  emit('pick', poi);
}
</script>

<template>
  <div class="panel">
    <div class="sheet-head">
      <span class="tag">搜索附近</span>
      <button class="icon-btn" type="button" aria-label="关闭" @click="emit('close')">
        <Icon name="close" :size="18" />
      </button>
    </div>
    <h2 class="sheet-title">搜索附近</h2>
    <p class="sheet-sub">以地图中心为圆心，选一家店或一个景点记下来。</p>

    <div class="field">
      <span class="field-label">搜这一带</span>
      <div class="chips chips--inline" role="group" aria-label="周边范围">
        <button
          v-for="option in RADIUS_OPTIONS"
          :key="option"
          class="chip"
          :class="{ 'is-active': props.radius === option }"
          type="button"
          :aria-pressed="props.radius === option"
          @click="emit('update:radius', option)"
        >
          {{ option < 1000 ? `${option}m` : `${option / 1000}km` }}
        </button>
      </div>
      <p class="field-hint">以地图中心为准，拖动地图可以换个范围。</p>
    </div>

    <div class="field">
      <label for="nearby-keyword">或者按关键词检索</label>
      <div class="search-inline">
        <input
          id="nearby-keyword"
          v-model="keyword"
          type="search"
          placeholder="店名、景点或地址"
          autocomplete="off"
          @keydown.enter.prevent="search"
        />
        <button class="btn btn--ghost btn--sm" type="button" @click="search">搜索</button>
      </div>
      <button v-if="query" class="link-btn" type="button" @click="reset">← 回到「搜这一带」</button>
    </div>

    <div class="results">
      <p v-if="loading" class="results-hint">正在找…</p>
      <button
        v-for="poi in results"
        :key="poi.id"
        class="result"
        type="button"
        @click="pick(poi)"
      >
        <span class="result-main">
          <span class="result-name od-truncate">{{ poi.name }}</span>
          <span class="result-meta">
            {{ categoryLabel(poi.category, TYPE_LABEL[poi.type]) }}
            <template v-if="poi.distance !== null"> · {{ distanceLabel(poi.distance) }}</template>
            <template v-if="poi.address"> · {{ poi.address }}</template>
          </span>
        </span>
        <span v-if="poi.existingPlaceId" class="badge">已记录</span>
        <Icon v-else name="chevron" :size="16" />
      </button>

      <div v-if="!loading && !results.length" class="empty-state">
        <p>
          {{ query ? `高德没有返回「${query}」` : '这个范围里没有可记录的地点' }}。换个范围，或者手动记一笔。
        </p>
      </div>
    </div>

    <div class="sheet-actions">
      <button class="btn btn--ghost" type="button" @click="emit('manual', keyword.trim())">
        在地图上手动记一笔
      </button>
    </div>
  </div>
</template>
