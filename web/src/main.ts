import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { VueQueryPlugin } from '@tanstack/vue-query';
import App from './App.vue';
import { router } from './router.ts';
import './styles/app.css';
import { installFpsMeter } from './lib/fps.ts';

createApp(App).use(createPinia()).use(router).use(VueQueryPlugin).mount('#app');

installFpsMeter();
