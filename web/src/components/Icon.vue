<script setup lang="ts">
import { computed } from 'vue';
import { iconPaths } from '../lib/icons.ts';

const props = withDefaults(defineProps<{ name: string; size?: string | number }>(), {
  size: undefined,
});

const style = computed(() =>
  props.size === undefined ? undefined : { '--od-icon-size': typeof props.size === 'number' ? `${props.size}px` : props.size },
);
</script>

<template>
  <svg
    class="od-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
    :style="style"
    v-html="iconPaths(name)"
  />
</template>
