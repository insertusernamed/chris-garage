<template>
  <section id="top" class="now">
    <div class="reading">
      <p class="station">{{ station }}</p>
      <p class="temp" :class="{ empty: celsius == null, flash }" aria-live="polite">
        <span class="num">{{ tempShown }}</span>
        <span class="unit">°{{ unit }}</span>
      </p>
      <p class="line">{{ line }}</p>
      <p class="when">{{ when }}</p>
    </div>

    <div class="facts" aria-label="Station log">
      <button
        v-for="fact in facts"
        :key="fact.label"
        type="button"
        class="fact"
        :aria-labelledby="`${fact.tipId}-k ${fact.tipId}-v`"
        :aria-describedby="fact.tipId"
      >
        <span :id="`${fact.tipId}-k`">{{ fact.label }}</span>
        <strong :id="`${fact.tipId}-v`">{{ fact.value }}</strong>
        <span :id="fact.tipId" class="tip" role="tooltip">{{ fact.tip }}</span>
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useWeather } from '@/composables/useWeather'
import { useAnimatedNumber } from '@/composables/useAnimatedNumber'
import {
  cToF,
  conditionLine,
  dewPointLabel,
  displayDew,
  displayTemp,
  formatStamp,
  tendencyFromSlope,
} from '@/lib/meteo'

const { unit, celsius, humidity, pressure, dew, hx, range, forecast, status, stampMs, error } =
  useWeather()

const displayC = computed(() => {
  if (celsius.value == null) return null
  return unit.value === 'F' ? cToF(celsius.value) : celsius.value
})
const tempShown = useAnimatedNumber(displayC, 1)
const humidityShown = useAnimatedNumber(humidity, 0)
const pressureShown = useAnimatedNumber(pressure, 1)
const dewShown = computed(() => {
  if (dew.value == null) return '—'
  return displayDew(dew.value, unit.value)
})

const flash = ref(false)
let flashTimer = 0
watch(displayC, (next, prev) => {
  if (next == null || prev == null || next === prev) return
  flash.value = true
  window.clearTimeout(flashTimer)
  flashTimer = window.setTimeout(() => {
    flash.value = false
  }, 680)
})

const station = computed(() => {
  if (status.value === 'offline') return 'Garage station · offline'
  if (status.value === 'stale') return 'Garage station · stale'
  return 'Garage station · SenseHAT'
})

const line = computed(() => {
  if (error.value && celsius.value == null) return 'Station unreachable.'
  if (celsius.value == null || humidity.value == null) return 'Waiting on the first reading.'
  return conditionLine(celsius.value, humidity.value, forecast.value, unit.value)
})

const when = computed(() => {
  if (!stampMs.value) return 'Waiting for a timestamp.'
  return formatStamp(stampMs.value)
})

const facts = computed(() => {
  const rh = humidity.value
  const items = [
    {
      label: 'Humidity',
      value: rh == null ? '—' : `${humidityShown.value}%`,
      tip: dew.value != null
        ? `Water in the garage air. Dew point is ${dewPointLabel(dew.value)} at this temperature.`
        : 'Water in the garage air. Above about 60% here usually feels sticky.',
      tipId: 'tip-humidity',
    },
    {
      label: 'Pressure',
      value: pressure.value == null ? '—' : `${pressureShown.value} mb`,
      tip: 'Barometer in millibars. Rising often means settling weather; falling often means unsettled.',
      tipId: 'tip-pressure',
    },
    {
      label: 'Dew point',
      value: dewShown.value,
      tip: 'Temperature where this air would saturate. Closer to room temperature means damper air.',
      tipId: 'tip-dew',
    },
    {
      label: 'Last hour',
      value: range.value
        ? `${displayTemp(range.value.min, unit.value)}–${displayTemp(range.value.max, unit.value)}°${unit.value}`
        : '—',
      tip: 'Highest and lowest temperature persisted over the last 60 minutes.',
      tipId: 'tip-hour',
    },
  ]
  if (hx.value != null && celsius.value != null) {
    items.push({
      label: 'Humidex',
      value: `${displayTemp(hx.value, unit.value)}°${unit.value}`,
      tip: 'Canadian humidex: how hot it feels once humidity is included. Shown only when the garage is warm.',
      tipId: 'tip-humidex',
    })
  } else {
    items.push({
      label: 'Updated',
      value: stampMs.value ? formatStamp(stampMs.value) : '—',
      tip: 'When the SenseHAT last sent a reading the station treated as live.',
      tipId: 'tip-updated',
    })
  }
  const tend = tendencyFromSlope(forecast.value?.baroSlopeHourlyLinear ?? 0)
  items.push({
    label: 'Tendency',
    value: tend.dir === 'steady' ? 'Steady' : tend.dir === 'rising' ? 'Rising' : 'Falling',
    tip: `${tend.phrase}. Taken from the last hour of barometer slope, not a public forecast.`,
    tipId: 'tip-tend',
  })
  return items
})
</script>

<style scoped>
.now {
  width: var(--page);
  margin: 0 auto;
  padding: 2.2rem 0 1.6rem;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(18rem, 26rem);
  gap: 2rem 3.5rem;
  align-items: end;
}

.station {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--pen);
}

.temp {
  display: flex;
  align-items: flex-start;
  gap: 0.12rem;
  margin: 0.1rem 0 0.55rem;
  line-height: 0.8;
  color: var(--ink);
  transition: color 0.68s var(--ease);
}

.temp.flash {
  color: var(--pen);
}

.num {
  font-family: var(--display);
  font-weight: 700;
  font-size: clamp(4.6rem, 12vw, 7.4rem);
  letter-spacing: -0.03em;
  font-variant-numeric: tabular-nums;
}

.temp.empty .num {
  font-size: clamp(2.2rem, 8vw, 3.6rem);
}

.unit {
  margin-top: 0.65rem;
  font-family: var(--display);
  font-weight: 600;
  font-size: clamp(1.15rem, 2.4vw, 1.55rem);
  color: var(--ink-dim);
}

.line {
  max-width: 28rem;
  font-size: 1.12rem;
  color: var(--ink);
}

.when {
  margin-top: 0.7rem;
  font-size: 0.9rem;
  color: var(--ink-dim);
}

.facts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
  border-top: 1px solid var(--rule);
}

.fact {
  position: relative;
  appearance: none;
  background: none;
  border: 0;
  margin: 0;
  padding: 0.85rem 0.9rem 0.85rem 0;
  text-align: left;
  cursor: help;
  border-bottom: 1px solid var(--rule);
  color: inherit;
}

.fact:nth-child(odd) {
  padding-right: 1rem;
  border-right: 1px solid var(--rule);
}

.fact:nth-child(even) {
  padding-left: 1rem;
}

.fact span:first-child {
  display: block;
  font-size: 0.82rem;
  font-weight: 500;
  color: var(--ink-dim);
}

.fact strong {
  display: block;
  margin-top: 0.15rem;
  font-family: var(--display);
  font-weight: 600;
  font-size: 1.45rem;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}

.tip {
  position: absolute;
  left: 0;
  top: auto;
  bottom: calc(100% + 0.4rem);
  z-index: 6;
  width: max(100%, 15rem);
  padding: 0.55rem 0.7rem;
  background: var(--ink);
  color: var(--paper);
  font-size: 0.82rem;
  line-height: 1.35;
  font-weight: 400;
  opacity: 0;
  pointer-events: none;
  transform: translateY(4px);
  transition: opacity 0.16s var(--ease), transform 0.16s var(--ease);
}

.fact:nth-child(even) .tip {
  left: auto;
  right: 0;
}

.fact:hover .tip,
.fact:focus-visible .tip {
  opacity: 1;
  transform: translateY(0);
}

@media (hover: none) {
  .fact:focus .tip {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 860px) {
  .now {
    grid-template-columns: 1fr;
    gap: 1.4rem;
  }
}
</style>
