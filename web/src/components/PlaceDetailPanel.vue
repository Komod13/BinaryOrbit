<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { useQuery, useQueryClient } from '@tanstack/vue-query';
import Icon from './Icon.vue';
import StarRating from './StarRating.vue';
import { deletePlace, deleteVisit, fetchPlace, qk } from '../lib/queries.ts';
import { TYPE_LABEL, averageRating, categoryLabel, shortDate, tierSummary } from '../lib/format.ts';
import type { Place } from '../lib/types.ts';
import { toast, toastError } from '../lib/toast.ts';

const props = defineProps<{
  placeId: number;
  tiers: { low: number; high: number };
}>();

const emit = defineEmits<{
  again: [place: Place];
  deleted: [];
  close: [];
}>();

const queryClient = useQueryClient();
const { data, isLoading } = useQuery({
  queryKey: computed(() => qk.place(props.placeId)),
  queryFn: () => fetchPlace(props.placeId),
});

const place = computed(() => data.value?.place ?? null);
const visits = computed(() => data.value?.visits ?? []);
const rating = computed(() => averageRating(visits.value));

const armedVisit = ref<number | null>(null);
const armedPlace = ref(false);
let armTimer: ReturnType<typeof setTimeout> | null = null;

function armVisit(id: number): void {
  if (armedVisit.value === id) {
    armedVisit.value = null;
    void removeVisit(id);
    return;
  }
  armedVisit.value = id;
  resetArmTimer();
}

function armPlace(): void {
  if (armedPlace.value) {
    armedPlace.value = false;
    void removePlace();
    return;
  }
  armedPlace.value = true;
  resetArmTimer();
}

function resetArmTimer(): void {
  if (armTimer) clearTimeout(armTimer);
  armTimer = setTimeout(() => {
    armedVisit.value = null;
    armedPlace.value = false;
  }, 3000);
}

function invalidate(): void {
  void queryClient.invalidateQueries({ queryKey: ['places'] });
  void queryClient.invalidateQueries({ queryKey: qk.stats });
  void queryClient.invalidateQueries({ queryKey: qk.cities });
  void queryClient.invalidateQueries({ queryKey: ['place', props.placeId] });
}

async function removeVisit(id: number): Promise<void> {
  try {
    const result = await deleteVisit(id);
    if (result.placeDeleted) {
      toast('已删除该地点的最后一条到访，地点同时被删除');
      invalidate();
      emit('deleted');
      return;
    }
    toast('已删除这条到访');
    invalidate();
  } catch (error) {
    toastError(error);
  }
}

async function removePlace(): Promise<void> {
  try {
    await deletePlace(props.placeId);
    toast('已删除该地点');
    invalidate();
    emit('deleted');
  } catch (error) {
    toastError(error);
  }
}

onBeforeUnmount(() => {
  if (armTimer) clearTimeout(armTimer);
});
</script>

<template>
  <div class="panel">
    <div class="sheet-head">
      <span v-if="place" class="tag" :class="{ 'tag--spot': place.type === 'spot' }">
        {{ TYPE_LABEL[place.type] }}
      </span>
      <span v-else class="tag tag--quiet">地点</span>
      <button class="icon-btn" type="button" aria-label="关闭" @click="emit('close')">
        <Icon name="close" :size="18" />
      </button>
    </div>

    <p v-if="isLoading" class="sheet-sub">加载中…</p>

    <template v-else-if="place">
      <h2 class="sheet-title">{{ place.name }}</h2>
      <p class="sheet-sub">
        {{ categoryLabel(place.category, TYPE_LABEL[place.type]) }}
        <template v-if="place.address"> · {{ place.address }}</template>
      </p>

      <div class="facts">
        <div class="fact od-stat">
          <span class="fact-num od-nowrap">{{ place.visitCount ?? visits.length }}<small>次</small></span>
          <span class="fact-label">到访</span>
        </div>
        <div class="fact od-stat">
          <span class="fact-num od-nowrap">{{ shortDate(place.lastVisitedOn) }}</span>
          <span class="fact-label">最近一次</span>
        </div>
        <div class="fact od-stat">
          <span class="fact-num od-nowrap">{{ rating }}</span>
          <span class="fact-label">平均评分</span>
        </div>
      </div>

      <div class="section-head">
        <h3 class="section-title">到访记录</h3>
        <span class="section-count">{{ visits.length }} 条</span>
      </div>

      <ul class="visits">
        <li v-for="visit in visits" :key="visit.id" class="visit">
          <div class="visit-head">
            <span class="visit-date od-nowrap">{{ visit.date }}</span>
            <span class="visit-meta">
              <StarRating v-if="visit.rating" :model-value="visit.rating" :size="13" readonly />
              <template v-else>未评分</template>
              <template v-if="visit.priceTier"> · {{ tierSummary(visit.priceTier, tiers) }}</template>
            </span>
            <button
              class="visit-delete"
              :class="{ 'is-armed': armedVisit === visit.id }"
              type="button"
              :aria-label="armedVisit === visit.id ? '确认删除这条到访' : '删除这条到访'"
              @click="armVisit(visit.id)"
            >
              <Icon v-if="armedVisit !== visit.id" name="trash" :size="15" />
              <span v-else>确认删除？</span>
            </button>
          </div>
          <p v-if="visit.note" class="visit-note">{{ visit.note }}</p>
        </li>
        <li v-if="!visits.length" class="visit">
          <p class="visit-note">还没有到访记录。</p>
        </li>
      </ul>

      <div class="sheet-actions">
        <button class="btn btn--primary" type="button" @click="place && emit('again', place)">
          <Icon name="again" :size="17" />再去一次
        </button>
        <button
          class="btn"
          :class="armedPlace ? 'btn--danger' : 'btn--ghost'"
          type="button"
          @click="armPlace"
        >
          <Icon name="trash" :size="17" />{{ armedPlace ? '再点一次确认删除' : '删除地点' }}
        </button>
      </div>
    </template>
  </div>
</template>
