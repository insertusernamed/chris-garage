<template>
  <section id="hour" class="charts">
    <div class="inner">
      <div class="head">
        <div>
          <h2>{{ heading }}</h2>
          <p>{{ lede }}</p>
        </div>
        <div class="controls">
          <div class="group" role="tablist" aria-label="Range">
            <button
              type="button"
              role="tab"
              :aria-selected="range === 'hour'"
              :class="{ on: range === 'hour' }"
              @click="range = 'hour'"
            >
              Last hour
            </button>
            <button
              type="button"
              role="tab"
              :aria-selected="range === 'archive'"
              :class="{ on: range === 'archive' }"
              @click="range = 'archive'"
            >
              Archive
            </button>
          </div>
          <div class="group" role="tablist" aria-label="Series">
            <button
              v-for="item in series"
              :key="item.id"
              type="button"
              role="tab"
              :aria-selected="active === item.id"
              :class="{ on: active === item.id }"
              @click="active = item.id"
            >
              {{ item.label }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <TraceChart
      :key="`${range}-${active}`"
      :points="points"
      :y-label="yLabel"
      :format-value="formatValue"
      :min-span="minSpan"
      :long-time="range === 'archive'"
      :aria="aria"
      :empty="empty"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import TraceChart, { type ChartPoint } from './TraceChart.vue'
import { useWeather } from '@/composables/useWeather'
import { cToF, parseStamp } from '@/lib/meteo'

type SeriesId = 'temperature' | 'humidity' | 'pressure'
type RangeId = 'hour' | 'archive'

const { hour, live, unit } = useWeather()
const active = ref<SeriesId>('temperature')
const range = ref<RangeId>('hour')

const series: { id: SeriesId; label: string }[] = [
  { id: 'temperature', label: 'Temperature' },
  { id: 'humidity', label: 'Humidity' },
  { id: 'pressure', label: 'Pressure' },
]

const ARCHIVE_SOON = 'Archive feature will be available in a future update'

const rows = computed(() => {
  if (range.value === 'archive') return []
  const src = [...hour.value]
  src.sort((a, b) => parseStamp(a.dstamp) - parseStamp(b.dstamp))
  if (range.value === 'hour' && live.value) {
    const last = src[src.length - 1]
    const liveMs = parseStamp(live.value.dstamp)
    const lastMs = last ? parseStamp(last.dstamp) : NaN
    if (!Number.isFinite(lastMs) || liveMs >= lastMs) {
      if (Number.isFinite(lastMs) && liveMs - lastMs < 2500 && src.length) {
        src[src.length - 1] = live.value
      } else {
        src.push(live.value)
      }
    }
  }
  return src
})

function rawValue(row: (typeof rows.value)[number], id: SeriesId) {
  if (id === 'humidity') return row.humidity
  if (id === 'pressure') return row.pressure
  return unit.value === 'F' ? cToF(row.temperature) : row.temperature
}

const points = computed<ChartPoint[]>(() =>
  rows.value.map((row) => ({
    value: rawValue(row, active.value),
    dstamp: row.dstamp,
  })),
)

const yLabel = computed(() => {
  if (active.value === 'humidity') return '%'
  if (active.value === 'pressure') return 'mb'
  return `°${unit.value}`
})

function formatValue(n: number) {
  if (active.value === 'humidity') return n.toFixed(0)
  if (active.value === 'pressure') return n.toFixed(1)
  return n.toFixed(1)
}

const minSpan = computed(() => {
  if (active.value === 'humidity') return 4
  if (active.value === 'pressure') return 2
  return 1.2
})

const heading = computed(() =>
  range.value === 'archive' ? 'Station archive' : 'Last hour',
)

const lede = computed(() => {
  if (range.value === 'archive') return ARCHIVE_SOON
  const vals = points.value.map((p) => p.value).filter(Number.isFinite)
  if (!vals.length) return 'Minute samples. Move across the plot for the time and value.'
  const min = formatValue(Math.min(...vals))
  const max = formatValue(Math.max(...vals))
  return `${min}–${max} ${yLabel.value} this hour. Time runs left to right, up to the live reading.`
})

const aria = computed(() => {
  const n = points.value.length
  const kind = series.find((s) => s.id === active.value)?.label ?? 'Temperature'
  return `${kind} chart, ${n} samples, ${range.value === 'archive' ? 'archive' : 'last hour'}. Arrow keys move the readout.`
})

const empty = computed(() =>
  range.value === 'archive' ? ARCHIVE_SOON : 'No samples yet.',
)
</script>

<style scoped>
.charts {
  padding: 0.4rem 0 0;
}

.inner {
  padding: 0 0.7rem 0 0.85rem;
}

.head {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 1rem 1.5rem;
  align-items: end;
  margin-bottom: 0.9rem;
}

h2 {
  font-family: var(--display);
  font-weight: 600;
  font-size: 1.55rem;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.head p {
  margin-top: 0.25rem;
  color: var(--ink-dim);
  max-width: 36rem;
}

.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.85rem 1.4rem;
}

.group {
  display: flex;
  gap: 0.85rem;
}

.group button {
  appearance: none;
  background: none;
  border: 0;
  padding: 0 0 0.15rem;
  cursor: pointer;
  font-size: 0.95rem;
  font-weight: 500;
  color: var(--ink-dim);
  border-bottom: 2px solid transparent;
}

.group button.on,
.group button:hover {
  color: var(--pen);
}

.group button.on {
  border-bottom-color: var(--pen);
}

@media (max-width: 720px) {
  .controls,
  .group {
    width: 100%;
  }
}
</style>
