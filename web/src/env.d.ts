/// <reference types="vite/client" />

/** 由 vite.config.ts 的 define 注入：构建时间戳。 */
declare const __BUILD_STAMP__: string;

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>;
  export default component;
}
