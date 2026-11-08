<script setup lang="ts">
defineOptions({ name: 'CitiesView' });
</script>

<template>
  <section class="surface" aria-label="城市">
    <div class="placeholder">
      <h1>走过的城市</h1>
      <p>骨架已就绪：下一步接入地级市 GeoJSON 图层。</p>
      <p><code>/api/cities/geo</code> 逐省下发边界</p>
    </div>
  </section>
</template>
