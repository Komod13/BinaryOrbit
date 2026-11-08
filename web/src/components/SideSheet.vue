<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';

const props = defineProps<{ open: boolean; labelledBy?: string }>();
const emit = defineEmits<{ close: [] }>();

const dialog = ref<HTMLDialogElement | null>(null);
const panel = ref<HTMLElement | null>(null);

watch(
  () => props.open,
  async (open) => {
    const element = dialog.value;
    if (!element) return;
    if (open && !element.open) {
      element.showModal();
      await nextTick();
      const target = panel.value?.querySelector<HTMLElement>('[data-autofocus]');
      (target ?? panel.value)?.focus({ preventScroll: true });
    } else if (!open && element.open) {
      element.close();
    }
  },
);

function onBackdrop(event: MouseEvent): void {
  if (event.target === dialog.value) emit('close');
}
</script>

<template>
  <dialog
    ref="dialog"
    class="sheet"
    :aria-labelledby="labelledBy"
    @click="onBackdrop"
    @close="emit('close')"
    @cancel.prevent="emit('close')"
  >
    <div ref="panel" class="sheet-panel" tabindex="-1">
      <div class="sheet-grip" aria-hidden="true" />
      <slot />
    </div>
  </dialog>
</template>
