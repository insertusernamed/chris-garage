<template>
  <header class="site-header">
    <a class="mark" href="#top">Chris's Garage</a>
    <nav aria-label="Station">
      <span class="live" :data-status="status">{{ statusLabel }}</span>
      <a href="#hour">Charts</a>
      <div class="units" role="group" aria-label="Temperature unit">
        <button type="button" :class="{ on: unit === 'C' }" @click="setUnit('C')">C</button>
        <span aria-hidden="true">/</span>
        <button type="button" :class="{ on: unit === 'F' }" @click="setUnit('F')">F</button>
      </div>
    </nav>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useWeather } from '@/composables/useWeather'

const { unit, status, setUnit } = useWeather()

const statusLabel = computed(() => {
  if (status.value === 'live') return 'Live'
  if (status.value === 'stale') return 'Stale'
  if (status.value === 'offline') return 'Offline'
  return 'Waiting'
})
</script>

<style scoped>
.site-header {
  height: var(--header-h);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 calc((100% - var(--page)) / 2);
  border-bottom: 1px solid var(--rule);
  background: var(--paper);
}

.mark {
  font-family: var(--display);
  font-weight: 600;
  font-size: 1.35rem;
  letter-spacing: 0.02em;
  text-decoration: none;
  text-transform: uppercase;
}

nav {
  display: flex;
  align-items: center;
  gap: 1.25rem;
}

nav a,
.live,
.units button,
.units span {
  font-size: 0.92rem;
  font-weight: 500;
  text-decoration: none;
  color: var(--ink);
}

.live {
  color: var(--ink-dim);
}

.live[data-status='live'] {
  color: var(--pen);
  font-weight: 600;
}

.live[data-status='offline'],
.live[data-status='stale'] {
  color: var(--ink-faint);
}

.units {
  display: flex;
  align-items: baseline;
  gap: 0.35rem;
}

.units span {
  color: var(--ink-faint);
}

.units button {
  appearance: none;
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
  color: var(--ink-dim);
}

.units button.on {
  color: var(--pen);
  font-weight: 600;
  box-shadow: inset 0 -2px 0 var(--pen);
}

@media (max-width: 640px) {
  .mark {
    font-size: 1.05rem;
  }

  nav {
    gap: 0.7rem;
  }
}
</style>
