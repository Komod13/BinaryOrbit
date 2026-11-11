<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue';
import { useSheetDrag } from '../lib/useSheetDrag.ts';

const props = defineProps<{ open: boolean; labelledBy?: string; label?: string }>();
const emit = defineEmits<{ close: [] }>();

const dialog = ref<HTMLDialogElement | null>(null);
const panel = ref<HTMLElement | null>(null);
const drag = useSheetDrag(panel);

async function openDialog(): Promise<void> {
  const element = dialog.value;
  if (!element || element.open) return;
  element.showModal();
  await nextTick();
  const target = panel.value?.querySelector<HTMLElement>('[data-autofocus]');
  (target ?? panel.value)?.focus({ preventScroll: true });
}

function closeDialog(): void {
  const element = dialog.value;
  if (!element?.open) return;
  element.close();
  drag.reset();
}

watch(
  () => props.open,
  (open) => {
    if (open) void openDialog();
    else closeDialog();
  },
);

// 挂载时就是打开状态（例如父组件保留了状态）也要把 dialog 真正打开
onMounted(() => {
  if (props.open) void openDialog();
});

function onBackdrop(event: MouseEvent): void {
  if (event.target === dialog.value) emit('close');
}
</script>

<template>
  <dialog
    ref="dialog"
    class="sheet"
    :aria-labelledby="labelledBy"
    :aria-label="label"
    @click="onBackdrop"
    @cancel.prevent="emit('close')"
  >
    <div ref="panel" class="sheet-panel" tabindex="-1">
      <div class="sheet-grip" aria-hidden="true" />
      <slot />
    </div>
  </dialog>
</template>
