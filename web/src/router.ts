import { createRouter, createWebHistory } from 'vue-router';
import MapView from './views/MapView.vue';
import CitiesView from './views/CitiesView.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/map' },
    { path: '/map', name: 'map', component: MapView },
    { path: '/cities', name: 'cities', component: CitiesView },
    { path: '/:pathMatch(.*)*', redirect: '/map' },
  ],
});
