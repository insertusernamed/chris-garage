<template>
  <div class="app-shell">
    <a class="skip-link" href="#top">Skip to reading</a>
    <SiteHeader />
    <InstrumentHero />
    <main id="record">
      <HourTraces />
    </main>
    <SiteFooter />
  </div>
</template>

<script setup lang="ts">
import { watch } from 'vue'
import SiteHeader from './components/SiteHeader.vue'
import InstrumentHero from './components/InstrumentHero.vue'
import HourTraces from './components/HourTraces.vue'
import SiteFooter from './components/SiteFooter.vue'
import { useWeather } from './composables/useWeather'
import { displayTemp } from './lib/meteo'

const { celsius, unit } = useWeather()

watch(
  [celsius, unit],
  () => {
    if (celsius.value == null) {
      document.title = "Chris's Garage"
      return
    }
    document.title = `${displayTemp(celsius.value, unit.value)}°${unit.value} · Chris's Garage`
  },
  { immediate: true },
)
</script>
