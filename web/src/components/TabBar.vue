<script setup lang="ts">
import { useRoute } from 'vue-router';
import Icon from './Icon.vue';

const route = useRoute();

const tabs = [
  { name: 'map', to: '/map', label: '地图', icon: 'map' },
  { name: 'cities', to: '/cities', label: '城市', icon: 'city' },
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
      <Icon :name="tab.icon" />
      <span>{{ tab.label }}</span>
    </router-link>
  </nav>
</template>
