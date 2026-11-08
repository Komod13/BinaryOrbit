<script setup lang="ts">
import TabBar from './components/TabBar.vue';
import StatsFloat from './components/StatsFloat.vue';
import Toast from './components/Toast.vue';
</script>

<template>
  <div class="app">
    <router-view v-slot="{ Component }">
      <keep-alive>
        <component :is="Component" />
      </keep-alive>
    </router-view>
    <StatsFloat />
    <TabBar />
    <Toast />
  </div>
</template>
