<script setup lang="ts">
import { computed, ref } from 'vue';
import Icon from './Icon.vue';
import { TYPE_LABEL } from '../lib/format.ts';
import type { Place, PlaceType } from '../lib/types.ts';

const props = defineProps<{
  kind: PlaceType;
  /** 已经是同类型的地点，组件只负责按名称过滤 */
  places: Place[];
  loading?: boolean;
  /** card = 桌面端下拉卡片；sheet = 手机端底部浮窗，滚动交给外层抽屉 */
  variant: 'card' | 'sheet';
}>();

const emit = defineEmits<{ close: []; select: [place: Place] }>();

const keyword = ref('');

const filtered = computed(() => {
  const query = keyword.value.trim().toLowerCase();
  return query ? props.places.filter((place) => place.name.toLowerCase().includes(query)) : props.places;
});

const title = computed(() => `已记录的${TYPE_LABEL[props.kind]}`);

const placeholder = computed(() => `按${TYPE_LABEL[props.kind]}名称检索`);

const emptyLabel = computed(() => `还没有记录${TYPE_LABEL[props.kind]}，从地图上记一笔吧。`);
</script>

<template>
  <div class="stats-list-panel" :class="`stats-list-panel--${variant}`">
    <div class="stats-list-head" :class="{ 'sheet-head': variant === 'sheet' }">
      <span class="stats-list-heading">
        <span class="stats-list-title">{{ title }}</span>
        <span class="stats-list-count">共 {{ places.length }} 处</span>
      </span>
      <button class="icon-btn stats-list-close" type="button" aria-label="关闭列表" @click="emit('close')">
        <Icon name="close" :size="18" />
      </button>
    </div>

    <div class="stats-search">
      <Icon name="search" :size="16" />
      <input
        v-model="keyword"
        type="search"
        autocomplete="off"
        :placeholder="placeholder"
        :aria-label="placeholder"
      />
    </div>

    <ul class="stats-list-body">
      <li v-for="place in filtered" :key="place.id">
        <button class="stats-place" type="button" @click="emit('select', place)">
          <span class="stats-place-dot" :class="`stats-place-dot--${place.type}`" aria-hidden="true" />
          <span class="stats-place-main">
            <span class="stats-place-name">{{ place.name }}</span>
            <span class="stats-place-meta">
              到访 {{ place.visitCount ?? 0 }} 次<template v-if="place.address"> · {{ place.address }}</template>
            </span>
          </span>
        </button>
      </li>

      <li v-if="loading" class="stats-list-empty">正在读取…</li>
      <li v-else-if="!filtered.length" class="stats-list-empty">
        <template v-if="keyword.trim()">没有找到「{{ keyword.trim() }}」</template>
        <template v-else>{{ emptyLabel }}</template>
      </li>
    </ul>
  </div>
</template>
