<script setup lang="ts">
import { computed } from 'vue';
import Icon from './Icon.vue';

const props = withDefaults(
  defineProps<{ modelValue: number | null; size?: number; readonly?: boolean }>(),
  { size: 22, readonly: false },
);
const emit = defineEmits<{ 'update:modelValue': [value: number | null] }>();

function pick(value: number): void {
  if (props.readonly) return;
  emit('update:modelValue', props.modelValue === value ? null : value);
}

const sizeStyle = computed(() => ({ '--od-icon-size': `${props.size}px` }));
</script>

<template>
  <div class="star-row" :class="{ 'is-readonly': readonly }" role="img" :aria-label="`评分 ${modelValue ?? 0} 星`">
    <button
      v-for="value in [1, 2, 3, 4, 5]"
      :key="value"
      class="star"
      :class="{ 'is-active': modelValue !== null && value <= modelValue }"
      type="button"
      :aria-label="`${value} 星`"
      :aria-pressed="modelValue === value"
      :disabled="readonly"
      :style="sizeStyle"
      @click="pick(value)"
    >
      <Icon name="star" :size="size" />
    </button>
  </div>
</template>
