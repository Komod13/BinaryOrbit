import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { VueQueryPlugin } from '@tanstack/vue-query';
import App from './App.vue';
import { router } from './router.ts';
import './styles/app.css';
import { installDiag } from './lib/diag.ts';

createApp(App).use(createPinia()).use(router).use(VueQueryPlugin).mount('#app');

installDiag();
