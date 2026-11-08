<script setup lang="ts">
import TabBar from './components/TabBar.vue';
import StatsFloat from './components/StatsFloat.vue';
</script>

<template>
  <div class="app">
    <router-view />
    <StatsFloat />
    <TabBar />
  </div>
</template>
