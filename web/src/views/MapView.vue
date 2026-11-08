<script setup lang="ts">
defineOptions({ name: 'MapView' });
</script>

<template>
  <section class="surface" aria-label="地图">
    <div class="placeholder">
      <h1>地图</h1>
      <p>骨架已就绪：下一步接入高德 JSAPI 与标记层。</p>
      <p><code>/api/config</code> 提供 jsKey 与 serviceHost</p>
    </div>
  </section>
</template>
