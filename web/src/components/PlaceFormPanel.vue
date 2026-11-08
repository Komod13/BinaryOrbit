<script setup lang="ts">
import { computed, ref } from 'vue';
import { useQueryClient } from '@tanstack/vue-query';
import Icon from './Icon.vue';
import StarRating from './StarRating.vue';
import { addVisit, createPlace, fetchRegeo, qk } from '../lib/queries.ts';
import { TIER_LABEL, TYPE_LABEL, categoryLabel, distanceMeters, tierHint, todayISO } from '../lib/format.ts';
import { toast, toastError } from '../lib/toast.ts';
import type { Place, PlaceType, PoiResult, PriceTier } from '../lib/types.ts';

const props = defineProps<{
  tiers: { low: number; high: number };
  mode: 'new' | 'visit';
  poi?: PoiResult | null;
  place?: Place | null;
  presetName?: string;
  center: { lng: number; lat: number };
  places: Place[];
}>();

const emit = defineEmits<{
  saved: [{ deduped: boolean; name: string }];
  close: [];
}>();

const queryClient = useQueryClient();

const name = ref(props.poi?.name ?? props.place?.name ?? props.presetName ?? '');
const type = ref<PlaceType>(props.poi?.type ?? props.place?.type ?? 'restaurant');
const date = ref(todayISO());
const rating = ref<number | null>(null);
const tier = ref<PriceTier | null>(null);
const note = ref('');

const nameError = ref('');
const dateError = ref('');
const submitting = ref(false);
const mergeCandidate = ref<Place | null>(null);
const forceNew = ref(false);

const isManual = computed(() => props.mode === 'new' && !props.poi);
const showTier = computed(() => type.value === 'restaurant');
const position = computed(() => ({
  lng: props.poi?.lng ?? props.center.lng,
  lat: props.poi?.lat ?? props.center.lat,
}));

const title = computed(() => {
  if (props.mode === 'visit') return props.place?.name ?? '';
  if (props.poi) return '记录到这个地点';
  return '手动记一个地点';
});

const subtitle = computed(() => {
  if (props.mode === 'visit') return `已到访 ${props.place?.visitCount ?? 0} 次 · 这次只补一条到访记录`;
  if (props.poi)
    return `${categoryLabel(props.poi.category, TYPE_LABEL[props.poi.type])} · ${props.poi.address || '地图上的地点'}`;
  return '手动标记 · 地图中心附近';
});

function validate(): boolean {
  nameError.value = '';
  dateError.value = '';
  if (props.mode === 'new' && !props.poi && !name.value.trim()) {
    nameError.value = '请填写地点名称';
  }
  if (!date.value) dateError.value = '请选择到访日期';
  return !nameError.value && !dateError.value;
}

function visitPayload() {
  return {
    date: date.value,
    rating: rating.value,
    priceTier: type.value === 'restaurant' ? tier.value : null,
    note: note.value.trim() || null,
  };
}

function invalidate(): void {
  void queryClient.invalidateQueries({ queryKey: ['places'] });
  void queryClient.invalidateQueries({ queryKey: qk.stats });
  void queryClient.invalidateQueries({ queryKey: qk.cities });
}

async function submit(): Promise<void> {
  if (submitting.value || !validate()) return;

  // 「再来一次」：只追加到访
  if (props.mode === 'visit' && props.place) {
    submitting.value = true;
    try {
      await addVisit(props.place.id, visitPayload());
      invalidate();
      toast(`已记录「${props.place.name}」的第 ${(props.place.visitCount ?? 0) + 1} 次到访`);
      emit('saved', { deduped: true, name: props.place.name });
    } catch (error) {
      toastError(error);
    } finally {
      submitting.value = false;
    }
    return;
  }

  // 手动点：50m 内同名地点提示（DESIGN.md §3.2）
  if (isManual.value && !forceNew.value) {
    const candidate = props.places.find(
      (item) =>
        item.name.trim() === name.value.trim() &&
        distanceMeters(item.lng, item.lat, position.value.lng, position.value.lat) <= 50,
    );
    if (candidate) {
      mergeCandidate.value = candidate;
      return;
    }
  }

  submitting.value = true;
  try {
    let cityName = props.poi?.cityName ?? null;
    let cityAdcode = props.poi?.cityAdcode ?? null;
    let district = props.poi?.district ?? null;
    if (!cityAdcode) {
      try {
        const regeo = await fetchRegeo(position.value.lng, position.value.lat);
        cityName = regeo.cityName;
        cityAdcode = regeo.cityAdcode;
        district = regeo.district;
      } catch {
        /* 城市补全失败不阻塞保存 */
      }
    }

    const result = await createPlace({
      type: type.value,
      name: name.value.trim(),
      externalId: props.poi?.id ?? null,
      address: props.poi?.address ?? null,
      lng: position.value.lng,
      lat: position.value.lat,
      category: props.poi?.category ?? null,
      cityName,
      cityAdcode,
      district,
      ...visitPayload(),
    });

    invalidate();
    toast(
      result.deduped
        ? `「${result.place.name}」已存在，这次记为第 ${(result.place.visitCount ?? 1) + 1} 次到访`
        : `已保存「${result.place.name}」`,
    );
    emit('saved', { deduped: result.deduped, name: result.place.name });
  } catch (error) {
    toastError(error);
  } finally {
    submitting.value = false;
  }
}

async function mergeIntoExisting(): Promise<void> {
  const target = mergeCandidate.value;
  if (!target) return;
  mergeCandidate.value = null;
  submitting.value = true;
  try {
    await addVisit(target.id, visitPayload());
    invalidate();
    toast(`已合到「${target.name}」，记为第 ${(target.visitCount ?? 0) + 1} 次到访`);
    emit('saved', { deduped: true, name: target.name });
  } catch (error) {
    toastError(error);
  } finally {
    submitting.value = false;
  }
}

function keepNew(): void {
  mergeCandidate.value = null;
  forceNew.value = true;
  void submit();
}
</script>

<template>
  <div class="panel">
    <div class="sheet-head">
      <span class="tag" :class="{ 'tag--spot': type === 'spot', 'tag--quiet': mode === 'visit' }">
        {{ mode === 'visit' ? '再来一次' : '新地点' }}
      </span>
      <button class="icon-btn" type="button" aria-label="关闭" @click="emit('close')">
        <Icon name="close" :size="18" />
      </button>
    </div>

    <h2 class="sheet-title" :id="`form-title`">{{ title }}</h2>
    <p class="sheet-sub">{{ subtitle }}</p>

    <div v-if="mode === 'new' && !poi" class="field" :class="{ 'is-invalid': nameError }">
      <label for="form-name">名称</label>
      <div class="field-control">
        <input id="form-name" v-model="name" type="text" autocomplete="off" data-autofocus />
      </div>
      <p v-if="nameError" class="field-error">{{ nameError }}</p>
    </div>

    <fieldset v-if="mode === 'new' && !poi" class="field">
      <legend>类型</legend>
      <div class="segmented">
        <button
          v-for="option in (['restaurant', 'spot'] as PlaceType[])"
          :key="option"
          type="button"
          :class="{ 'is-active': type === option }"
          :aria-pressed="type === option"
          @click="
            () => {
              type = option;
              if (option === 'spot') tier = null;
            }
          "
        >
          {{ TYPE_LABEL[option] }}
        </button>
      </div>
    </fieldset>

    <div class="field" :class="{ 'is-invalid': dateError }">
      <label for="form-date">到访日期</label>
      <div class="field-control">
        <input id="form-date" v-model="date" type="date" max="2100-12-31" />
      </div>
      <p v-if="dateError" class="field-error">{{ dateError }}</p>
    </div>

    <fieldset class="field">
      <legend>评分（可选）</legend>
      <StarRating v-model="rating" />
      <p class="field-hint">再点一次已选中的星星可以取消。</p>
    </fieldset>

    <fieldset v-if="showTier" class="field">
      <legend>人均价位（可选）</legend>
      <div class="segmented">
        <button
          v-for="option in (['low', 'mid', 'high'] as PriceTier[])"
          :key="option"
          type="button"
          :class="{ 'is-active': tier === option }"
          :aria-pressed="tier === option"
          @click="tier = tier === option ? null : option"
        >
          {{ TIER_LABEL[option] }} · {{ tierHint(option, tiers) }}
        </button>
      </div>
      <p class="field-hint">
        低 &lt;{{ tiers.low }} · 中 {{ tiers.low }}–{{ tiers.high }} · 高 &gt;{{ tiers.high }} 元 / 人
      </p>
    </fieldset>

    <div class="field">
      <label for="form-note">备注（可选）</label>
      <div class="field-control">
        <textarea id="form-note" v-model="note" rows="2" maxlength="80" placeholder="一句话记下当时的感觉" />
      </div>
    </div>

    <div v-if="mergeCandidate" class="merge-box">
      <p>
        地图中心 50m 内已有同名地点「<b>{{ mergeCandidate.name }}</b>」，要合到它，还是仍然新建？
      </p>
      <div class="merge-actions">
        <button class="btn btn--primary btn--sm" type="button" @click="mergeIntoExisting">
          合到已有地点
        </button>
        <button class="btn btn--ghost btn--sm" type="button" @click="keepNew">仍然新建</button>
      </div>
    </div>

    <div class="sheet-actions">
      <button class="btn btn--primary" type="button" :disabled="submitting" @click="submit">
        {{ mode === 'visit' ? '保存这次到访' : '保存' }}
      </button>
      <button class="btn btn--ghost" type="button" @click="emit('close')">取消</button>
    </div>
  </div>
</template>
