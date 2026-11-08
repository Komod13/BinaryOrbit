<script setup lang="ts">
import { ref } from 'vue';
import { useSheetDrag } from '../lib/useSheetDrag.ts';

/** 「搜索附近」与录入表单共用的非模态底部卡片：移动端可以上拉到全屏。 */
const panel = ref<HTMLElement | null>(null);
useSheetDrag(panel);
</script>

<template>
  <div ref="panel" class="dock-panel">
    <div class="sheet-grip" aria-hidden="true" />
    <slot />
  </div>
</template>
