<script setup lang="ts">
import { useRoute } from 'vue-router';
import pinIcon from '../assets/icons/pin.png';
import shoeIcon from '../assets/icons/shoe.png';

const route = useRoute();

const tabs = [
  { name: 'map', to: '/map', label: '地图', icon: pinIcon },
  { name: 'cities', to: '/cities', label: '城市', icon: shoeIcon },
] as const;
</script>

<template>
  <nav class="tabbar" aria-label="主导航">
    <router-link
      v-for="tab in tabs"
      :key="tab.name"
      :to="tab.to"
      class="tab"
      :class="{ 'is-active': route.name === tab.name }"
      :aria-current="route.name === tab.name ? 'page' : undefined"
    >
      <img class="tab-icon" :src="tab.icon" alt="" aria-hidden="true" />
      <span>{{ tab.label }}</span>
    </router-link>
  </nav>
</template>
