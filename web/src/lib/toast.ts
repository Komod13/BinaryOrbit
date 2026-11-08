import { reactive } from 'vue';

export interface ToastItem {
  id: number;
  text: string;
  tone: 'info' | 'error';
}

let seq = 0;

export const toasts = reactive<ToastItem[]>([]);

export function toast(text: string, tone: 'info' | 'error' = 'info', ttl = 2600): void {
  const id = ++seq;
  toasts.push({ id, text, tone });
  setTimeout(() => {
    const index = toasts.findIndex((item) => item.id === id);
    if (index >= 0) toasts.splice(index, 1);
  }, ttl);
}

export function toastError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  toast(message, 'error', 3600);
}
