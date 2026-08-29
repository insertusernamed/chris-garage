<template>
  <footer class="site-footer">
    <p>
      SenseHAT on a Raspberry Pi in Chris's garage. Last hour is a sample each minute. Pressure
      tendency is the hourly barometer slope, not a public forecast.
    </p>
  </footer>
</template>

<style scoped>
.site-footer {
  width: var(--page);
  margin: 0 auto;
  padding: 1.6rem 0 2.4rem;
}

p {
  max-width: 42rem;
  font-size: 0.88rem;
  color: var(--ink-dim);
}
</style>
