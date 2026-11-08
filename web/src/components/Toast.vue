<script setup lang="ts">
import { toasts } from '../lib/toast.ts';
</script>

<template>
  <div class="toast-stack" role="status" aria-live="polite">
    <div v-for="item in toasts" :key="item.id" class="toast" :class="{ 'toast--error': item.tone === 'error' }">
      {{ item.text }}
    </div>
  </div>
</template>
