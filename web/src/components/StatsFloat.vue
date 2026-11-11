<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { useRoute } from 'vue-router';
import DockSheet from './DockSheet.vue';
import Icon from './Icon.vue';
import StatsListPanel from './StatsListPanel.vue';
import { apiGet } from '../lib/api.ts';
import { fetchPlaces, qk } from '../lib/queries.ts';
import { STORAGE_KEYS, readStorage, writeStorage } from '../lib/storage.ts';
import type { PlaceType, Stats } from '../lib/types.ts';

const MOBILE_QUERY = '(max-width: 859px)';

const route = useRoute();

const open = ref(readStorage(STORAGE_KEYS.statsCollapsed, false));
watch(open, (value) => {
  writeStorage(STORAGE_KEYS.statsCollapsed, value);
  // 手机上把统计卡收起来时，列表也一起关掉
  if (!value) closeList();
});

const { data } = useQuery({
  queryKey: qk.stats,
  queryFn: () => apiGet<Stats>('/api/stats'),
  retry: 1,
});

const stats = computed<Stats>(() => {
  const value = data.value as Partial<Stats> | undefined;
  return {
    restaurant: Number(value?.restaurant ?? 0) || 0,
    spot: Number(value?.spot ?? 0) || 0,
    city: Number(value?.city ?? 0) || 0,
  };
});
const total = computed(() => stats.value.restaurant + stats.value.spot);

/** 统计卡只在标记页可点，足迹页保持只读 */
const interactive = computed(() => route.name === 'map');

const listKind = ref<PlaceType | null>(null);
const root = ref<HTMLElement | null>(null);
const cardRef = ref<HTMLElement | null>(null);
const cardWidth = ref(0);
let cardObserver: ResizeObserver | null = null;

// 手机端改成和「添加新地点」一样的底部抽屉，桌面端仍是统计卡下方的下拉浮窗
const mobile = ref(false);
let mediaQuery: MediaQueryList | null = null;

function onMediaChange(event: MediaQueryListEvent): void {
  mobile.value = event.matches;
}

const placesQuery = useQuery({
  queryKey: computed(() => qk.places()),
  queryFn: () => fetchPlaces(),
  enabled: computed(() => interactive.value && listKind.value !== null),
  staleTime: 30_000,
});

const typePlaces = computed(() =>
  (placesQuery.data.value ?? []).filter((place) => place.type === listKind.value),
);

const listLoading = computed(() => placesQuery.isLoading.value);

const listAriaLabel = computed(() =>
  listKind.value ? `已记录的${listKind.value === 'restaurant' ? '餐厅' : '景点'}` : '',
);

function toggleList(kind: PlaceType): void {
  if (!interactive.value) return;
  if (listKind.value === kind) {
    closeList();
    return;
  }
  listKind.value = kind;
  // 手机上统计卡默认收起，点数字时先展开，统计卡保持可见
  open.value = true;
}

function closeList(): void {
  listKind.value = null;
}

function onPointerDown(event: PointerEvent): void {
  if (!listKind.value) return;
  const target = event.target as HTMLElement | null;
  if (!target) return;
  // 统计卡本身、桌面下拉浮窗都在 root 里；手机端的抽屉被 Teleport 到 body，需要单独判断
  if (root.value?.contains(target)) return;
  if (target.closest('.stats-sheet')) return;
  closeList();
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && listKind.value) closeList();
}

watch(
  () => route.name,
  (name) => {
    if (name !== 'map') closeList();
  },
);

onMounted(() => {
  mediaQuery = window.matchMedia(MOBILE_QUERY);
  mobile.value = mediaQuery.matches;
  mediaQuery.addEventListener('change', onMediaChange);
  document.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('keydown', onKeydown);

  // 桌面端下拉浮窗和统计卡同宽：直接跟着统计卡的真实宽度走，数字变多也不会错位
  if (cardRef.value) {
    const measure = (): void => {
      cardWidth.value = Math.round(cardRef.value?.getBoundingClientRect().width ?? 0);
    };
    measure();
    cardObserver = new ResizeObserver(measure);
    cardObserver.observe(cardRef.value);
  }
});

onBeforeUnmount(() => {
  mediaQuery?.removeEventListener('change', onMediaChange);
  cardObserver?.disconnect();
  document.removeEventListener('pointerdown', onPointerDown);
  window.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <section ref="root" class="stats" :data-open="open" aria-label="足迹统计">
    <button
      class="stats-toggle"
      type="button"
      :aria-expanded="open"
      aria-controls="statsCard"
      @click="open = !open"
    >
      <span class="stats-toggle-num">{{ total }}</span>
      <span class="stats-toggle-label">处足迹</span>
    </button>
    <div id="statsCard" ref="cardRef" class="stats-card">
      <button
        class="stat stat--action"
        type="button"
        :disabled="!interactive"
        :aria-expanded="listKind === 'restaurant'"
        aria-controls="statsList"
        @click="toggleList('restaurant')"
      >
        <span class="stat-num">{{ stats.restaurant }}</span>
        <span class="stat-label">餐厅</span>
      </button>
      <button
        class="stat stat--action"
        type="button"
        :disabled="!interactive"
        :aria-expanded="listKind === 'spot'"
        aria-controls="statsList"
        @click="toggleList('spot')"
      >
        <span class="stat-num">{{ stats.spot }}</span>
        <span class="stat-label">景点</span>
      </button>
      <div class="stat">
        <span class="stat-num">{{ stats.city }}</span>
        <span class="stat-label">城市</span>
      </div>
    </div>

    <div
      v-if="listKind && !mobile"
      id="statsList"
      class="stats-list"
      role="region"
      :aria-label="listAriaLabel"
      :style="cardWidth ? { width: `${cardWidth}px` } : undefined"
    >
      <StatsListPanel
        :key="listKind"
        :kind="listKind"
        :places="typePlaces"
        :loading="listLoading"
        variant="card"
        @close="closeList"
      />
    </div>
  </section>

  <Teleport to="body">
    <DockSheet v-if="listKind && mobile" class="stats-sheet">
      <div id="statsList" role="region" :aria-label="listAriaLabel">
        <StatsListPanel
          :key="listKind"
          :kind="listKind"
          :places="typePlaces"
          :loading="listLoading"
          variant="sheet"
          @close="closeList"
        />
      </div>
    </DockSheet>
  </Teleport>
</template>
