<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import Icon from './Icon.vue';
import { qk, searchText } from '../lib/queries.ts';
import { TYPE_LABEL, categoryLabel } from '../lib/format.ts';
import type { FilterKind, Place, PoiResult } from '../lib/types.ts';

const props = defineProps<{
  places: Place[];
  filter: FilterKind;
  cityName: string | null;
  cityAdcode: string | null;
  cityScope: 'city' | 'nation';
  resolvingCity?: boolean;
}>();

const emit = defineEmits<{
  'update:filter': [value: FilterKind];
  'update:scope-mode': [value: 'auto' | 'city' | 'nation'];
  openPlace: [id: number];
  openPoi: [poi: PoiResult];
  manual: [name: string];
  nearby: [];
  focusSearch: [];
}>();

const input = ref('');
const keyword = ref('');
const open = ref(false);
const active = ref(0);
let debounce: ReturnType<typeof setTimeout> | null = null;

watch(input, (value) => {
  if (debounce) clearTimeout(debounce);
  const trimmed = value.trim();
  open.value = trimmed.length > 0;
  active.value = 0;
  debounce = setTimeout(() => {
    keyword.value = trimmed;
  }, 300);
});

// 高德的 city 参数接受 adcode 或城市名，优先用 adcode（更稳）
const city = computed(() =>
  props.cityScope === 'city' ? props.cityAdcode ?? props.cityName ?? undefined : undefined,
);

const scopeLabel = computed(() => {
  if (props.cityScope === 'nation') return '全国';
  return props.cityName ?? (props.resolvingCity ? '定位中…' : '全国');
});

function toggleScope(): void {
  emit('update:scope-mode', props.cityScope === 'city' ? 'nation' : 'city');
}

const { data: remote, isFetching: remoteLoading } = useQuery({
  queryKey: computed(() => qk.searchText(keyword.value, 'all', city.value)),
  queryFn: () => searchText(keyword.value, undefined, city.value),
  enabled: computed(() => keyword.value.length > 0),
  staleTime: 60_000,
});

const localMatches = computed(() => {
  const query = keyword.value.toLowerCase();
  if (!query) return [];
  return props.places
    .filter((place) =>
      `${place.name} ${place.address ?? ''} ${place.category ?? ''}`.toLowerCase().includes(query),
    )
    .slice(0, 4);
});

const remoteMatches = computed(() => {
  const rows = remote.value?.results ?? [];
  return rows.filter((poi) => poi.existingPlaceId === null).slice(0, 4);
});

const rows = computed(() => [
  ...localMatches.value.map((place) => ({ kind: 'place' as const, place })),
  ...remoteMatches.value.map((poi) => ({ kind: 'poi' as const, poi })),
]);

const hasRows = computed(() => rows.value.length > 0);

function moveActive(delta: number): void {
  const total = rows.value.length;
  if (!total) return;
  active.value = (active.value + delta + total) % total;
}

function triggerRow(index: number): void {
  const row = rows.value[index];
  if (!row) return;
  open.value = false;
  input.value = '';
  if (row.kind === 'place') emit('openPlace', row.place.id);
  else emit('openPoi', row.poi);
}

function onEnter(): void {
  if (hasRows.value) triggerRow(active.value);
  else if (keyword.value) {
    open.value = false;
    emit('manual', keyword.value);
    input.value = '';
  }
}

function onEscape(): void {
  if (open.value) open.value = false;
  else input.value = '';
}

function pickManual(): void {
  const name = keyword.value;
  open.value = false;
  input.value = '';
  if (name) emit('manual', name);
}

function blurLater(): void {
  setTimeout(() => {
    open.value = false;
  }, 140);
}

const chips = computed(() => {
  const all = props.places;
  return [
    { id: 'all' as FilterKind, label: '全部', count: all.length },
    { id: 'restaurant' as FilterKind, label: '餐厅', count: all.filter((p) => p.type === 'restaurant').length },
    { id: 'spot' as FilterKind, label: '景点', count: all.filter((p) => p.type === 'spot').length },
  ];
});
</script>

<template>
  <header class="dock">
    <div class="dock-row">
      <div class="search-field">
        <span class="search-glyph"><Icon name="search" :size="18" /></span>
        <input
          v-model="input"
          type="search"
          placeholder="搜索餐厅、景点或地址"
          autocomplete="off"
          aria-label="搜索地点"
          :aria-expanded="open"
          @focus="
            () => {
              emit('focusSearch');
              if (keyword) open = true;
            }
          "
          @blur="blurLater"
          @keydown.down.prevent="moveActive(1)"
          @keydown.up.prevent="moveActive(-1)"
          @keydown.enter.prevent="onEnter"
          @keydown.esc.prevent="onEscape"
        />
      </div>
      <button class="nearby-btn" type="button" @click="emit('nearby')">
        <Icon name="pin" :size="17" />
        <span>搜索附近</span>
      </button>
    </div>

    <div class="chips" role="group" aria-label="按类型筛选">
      <button
        v-for="chip in chips"
        :key="chip.id"
        class="chip"
        :class="{ 'is-active': filter === chip.id }"
        type="button"
        :aria-pressed="filter === chip.id"
        @click="emit('update:filter', chip.id)"
      >
        {{ chip.label }}<span class="chip-count">{{ chip.count }}</span>
      </button>
    </div>

    <div v-if="open" class="suggest">
      <button
        v-for="(row, index) in rows"
        :key="row.kind === 'place' ? `p${row.place.id}` : `o${row.poi.id}`"
        class="suggest-row"
        :class="{ 'is-active': index === active }"
        type="button"
        @mousedown.prevent="triggerRow(index)"
        @mouseenter="active = index"
      >
        <span class="suggest-main">
          <span class="suggest-name">
            {{ row.kind === 'place' ? row.place.name : row.poi.name }}
          </span>
          <span class="suggest-meta">
            <template v-if="row.kind === 'place'">
              {{ TYPE_LABEL[row.place.type] }} · 已记录 {{ row.place.visitCount ?? 0 }} 次
            </template>
            <template v-else>
              {{ categoryLabel(row.poi.category, TYPE_LABEL[row.poi.type]) }} · 还没记录
            </template>
          </span>
        </span>
        <Icon :name="row.kind === 'place' ? 'chevron' : 'plus'" :size="16" />
      </button>

      <div v-if="!hasRows" class="suggest-empty">
        <p v-if="remoteLoading">正在搜索…</p>
        <p v-else>没有找到「{{ keyword }}」</p>
        <button class="btn btn--primary btn--sm" type="button" @mousedown.prevent="pickManual">
          <Icon name="plus" :size="16" />记一个「{{ keyword }}」
        </button>
      </div>

      <div class="suggest-foot">
        <button class="scope-toggle" type="button" @mousedown.prevent="toggleScope">
          <Icon name="pin" :size="14" />
          搜索范围：{{ scopeLabel }}
          <span class="scope-hint">切换</span>
        </button>
      </div>
    </div>
  </header>
</template>
