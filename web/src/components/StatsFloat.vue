<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { apiGet } from '../lib/api.ts';
import { STORAGE_KEYS, readStorage, writeStorage } from '../lib/storage.ts';

interface Stats {
  restaurant: number;
  spot: number;
  city: number;
}

const open = ref(readStorage(STORAGE_KEYS.statsCollapsed, false));
watch(open, (value) => writeStorage(STORAGE_KEYS.statsCollapsed, value));

const { data } = useQuery({
  queryKey: ['stats'],
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
</script>

<template>
  <section class="stats" :data-open="open" aria-label="足迹统计">
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
    <div id="statsCard" class="stats-card">
      <div class="stat od-stat">
        <span class="stat-num">{{ stats.restaurant }}</span>
        <span class="stat-label">餐厅</span>
      </div>
      <div class="stat od-stat">
        <span class="stat-num">{{ stats.spot }}</span>
        <span class="stat-label">景点</span>
      </div>
      <div class="stat od-stat">
        <span class="stat-num">{{ stats.city }}</span>
        <span class="stat-label">城市</span>
      </div>
    </div>
  </section>
</template>
