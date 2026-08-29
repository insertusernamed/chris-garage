<template>
  <div class="chart">
    <div
      class="plot"
      tabindex="0"
      :aria-label="aria"
      @pointermove="onPointer"
      @pointerdown="onPointer"
      @pointerleave="onLeave"
      @keydown="onKey"
    >
      <svg viewBox="0 0 1000 280" preserveAspectRatio="none" aria-hidden="true">
        <line
          v-for="tick in yTicks"
          :key="'y' + tick.value"
          class="grid"
          x1="0"
          :y1="tick.y"
          x2="1000"
          :y2="tick.y"
        />
        <line
          v-for="tick in vTicks"
          :key="'v' + tick.t"
          class="grid v"
          :x1="tick.x"
          :x2="tick.x"
          y1="0"
          y2="280"
        />
        <path v-if="area" class="area" :d="area" />
        <path v-if="line" class="line" :d="line" />
        <line v-if="hover" class="hair" :x1="hover.x" :x2="hover.x" y1="0" y2="280" />
        <circle v-if="hover" class="dot" :cx="hover.x" :cy="hover.y" r="4.5" />
        <circle v-if="end" class="end" :cx="end.x" :cy="end.y" r="4" />
      </svg>

      <div class="y-labels" aria-hidden="true">
        <span v-for="tick in yTicks" :key="tick.value" :style="{ top: tick.top }">
          {{ tick.text }}
        </span>
      </div>

      <p v-if="series.length" class="unit-tag">{{ yLabel }}</p>
      <p v-if="end && !hover" class="read">
        <strong>{{ end.value }}</strong>
        <span>{{ end.when }}</span>
      </p>
      <p v-else-if="hover" class="tip" :class="hover.edge" :style="{ left: hover.left }">
        <strong>{{ hover.value }}</strong>
        <span>{{ hover.when }}</span>
      </p>
      <p v-if="!series.length" class="empty">{{ empty }}</p>
    </div>
    <div class="x-labels" aria-hidden="true">
      <span
        v-for="tick in xLabels"
        :key="tick.t"
        :class="tick.edge"
        :style="{ left: tick.left }"
      >
        {{ tick.text }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  formatAxisDate,
  formatAxisTime,
  formatTooltipTime,
  niceScale,
  parseStamp,
  timeTicks,
} from '@/lib/meteo'

export type ChartPoint = {
  value: number
  dstamp: string | number
}

type Mark = {
  x: number
  y: number
  left: string
  value: string
  when: string
  edge?: 'start' | 'end'
}

const props = withDefaults(
  defineProps<{
    points: ChartPoint[]
    yLabel: string
    formatValue: (n: number) => string
    minSpan?: number
    longTime?: boolean
    aria: string
    empty?: string
  }>(),
  { empty: 'No samples yet.', minSpan: 0 },
)

const hover = ref<Mark | null>(null)
const H = 280

const series = computed(() =>
  props.points
    .map((p) => ({ value: p.value, t: parseStamp(p.dstamp) }))
    .filter((p) => Number.isFinite(p.value) && Number.isFinite(p.t))
    .sort((a, b) => a.t - b.t),
)

const domain = computed(() => {
  const pts = series.value
  if (!pts.length) return null
  const values = pts.map((p) => p.value)
  const scale = niceScale(Math.min(...values), Math.max(...values), 4, props.minSpan ?? 0)
  return {
    tMin: pts[0].t,
    tMax: pts[pts.length - 1].t,
    ...scale,
  }
})

function xAt(t: number) {
  const d = domain.value
  if (!d || d.tMax <= d.tMin) return 1000
  return ((t - d.tMin) / (d.tMax - d.tMin)) * 1000
}

function yAt(value: number) {
  const d = domain.value
  if (!d) return H / 2
  const pad = 16
  const span = d.max - d.min || 1
  return pad + (1 - (value - d.min) / span) * (H - pad * 2)
}

function markAt(index: number): Mark | null {
  const pts = series.value
  const p = pts[index]
  if (!p) return null
  const x = xAt(p.t)
  return {
    x,
    y: yAt(p.value),
    left: `${(x / 1000) * 100}%`,
    value: `${props.formatValue(p.value)} ${props.yLabel}`,
    when: formatTooltipTime(p.t),
    edge: x < 140 ? 'start' : x > 820 ? 'end' : undefined,
  }
}

const line = computed(() => {
  const pts = series.value
  if (pts.length < 2) return ''
  return pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${xAt(p.t).toFixed(2)} ${yAt(p.value).toFixed(2)}`)
    .join(' ')
})

const area = computed(() => {
  const d = line.value
  if (!d) return ''
  const lastX = xAt(series.value[series.value.length - 1].t).toFixed(2)
  return `${d} L${lastX} ${H} L0 ${H} Z`
})

const yTicks = computed(() => {
  const d = domain.value
  if (!d) return []
  return d.ticks.map((value) => {
    const y = yAt(value)
    return { value, y, top: `${(y / H) * 100}%`, text: props.formatValue(value) }
  })
})

const vTicks = computed(() => {
  const d = domain.value
  if (!d) return []
  return timeTicks(d.tMin, d.tMax, !!props.longTime).map((t) => ({ t, x: xAt(t) }))
})

const xLabels = computed(() => {
  const d = domain.value
  if (!d) return []
  const fmt = props.longTime ? formatAxisDate : formatAxisTime
  const minPct = 11
  const interiors = vTicks.value.filter((tick) => {
    const pct = (tick.x / 1000) * 100
    return pct >= minPct && pct <= 100 - minPct
  })
  return [
    { t: d.tMin, text: fmt(d.tMin), left: '0%', edge: 'start' as const },
    ...interiors.map((tick) => ({
      t: tick.t,
      text: fmt(tick.t),
      left: `${(tick.x / 1000) * 100}%`,
      edge: '' as const,
    })),
    { t: d.tMax, text: fmt(d.tMax), left: '100%', edge: 'end' as const },
  ]
})

const end = computed(() => markAt(series.value.length - 1))

function closestIndex(x: number) {
  const pts = series.value
  let best = 0
  let bestDist = Infinity
  for (let i = 0; i < pts.length; i++) {
    const dx = Math.abs(xAt(pts[i].t) - x)
    if (dx < bestDist) {
      bestDist = dx
      best = i
    }
  }
  return best
}

function onPointer(event: PointerEvent) {
  const pts = series.value
  if (pts.length < 2) return
  const svg = (event.currentTarget as HTMLElement).querySelector('svg')
  if (!svg) return
  const rect = svg.getBoundingClientRect()
  if (rect.width <= 0) return
  const x = ((event.clientX - rect.left) / rect.width) * 1000
  hover.value = markAt(closestIndex(x))
}

function onLeave(event: PointerEvent) {
  if (event.pointerType === 'mouse') hover.value = null
}

function onKey(event: KeyboardEvent) {
  const pts = series.value
  if (pts.length < 2) return
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  event.preventDefault()
  const current = hover.value
    ? closestIndex(hover.value.x)
    : pts.length - 1
  const next =
    event.key === 'ArrowLeft' ? Math.max(0, current - 1) : Math.min(pts.length - 1, current + 1)
  hover.value = markAt(next)
}
</script>

<style scoped>
.chart {
  background: var(--well);
  color: var(--well-ink);
  padding: 0.85rem 0.45rem 1rem 0;
  padding-left: max(0.85rem, calc((100% - var(--page)) / 2));
}

.plot {
  position: relative;
  margin-left: 3.25rem;
  min-height: 16.5rem;
  cursor: crosshair;
  outline: none;
}

.plot:focus-visible {
  box-shadow: inset 0 0 0 2px var(--trace);
}

svg {
  display: block;
  width: 100%;
  height: 16.5rem;
  overflow: visible;
}

.grid {
  stroke: var(--well-grid);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}

.grid.v {
  stroke-dasharray: 3 5;
}

.area {
  fill: var(--trace-fill);
}

.line {
  fill: none;
  stroke: var(--trace);
  stroke-width: 2.2;
  stroke-linejoin: round;
  stroke-linecap: round;
  vector-effect: non-scaling-stroke;
  animation: draw 0.7s var(--ease) both;
}

.hair {
  stroke: var(--well-ink);
  stroke-width: 1;
  opacity: 0.45;
  vector-effect: non-scaling-stroke;
}

.dot {
  fill: var(--well-ink);
}

.end {
  fill: var(--trace);
  stroke: var(--well);
  stroke-width: 2;
}

.y-labels {
  position: absolute;
  left: -3.25rem;
  top: 0;
  bottom: 0;
  width: 3.05rem;
}

.y-labels span {
  position: absolute;
  right: 0.45rem;
  transform: translateY(-50%);
  font-size: 0.72rem;
  color: #c5d4cc;
  font-variant-numeric: tabular-nums;
}

.x-labels {
  position: relative;
  height: 1.15rem;
  margin: 0.45rem 0 0 3.25rem;
  font-size: 0.72rem;
  color: var(--well-dim);
}

.x-labels span {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.x-labels span.start {
  transform: none;
}

.x-labels span.end {
  transform: translateX(-100%);
}

.unit-tag {
  position: absolute;
  top: 0.7rem;
  left: 0.75rem;
  margin: 0;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--well-dim);
}

.read,
.tip {
  position: absolute;
  z-index: 3;
  padding: 0.45rem 0.65rem;
  background: var(--paper);
  color: var(--ink);
  pointer-events: none;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  min-width: 8.2rem;
}

.read {
  top: 0.7rem;
  right: 0.9rem;
}

.tip {
  top: 0.7rem;
  transform: translateX(-50%);
}

.tip.start {
  transform: none;
}

.tip.end {
  transform: translateX(-100%);
}

.read strong,
.tip strong {
  font-family: var(--display);
  font-size: 1.05rem;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.read span,
.tip span {
  color: var(--ink-dim);
  font-size: 0.75rem;
}

.empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  margin: 0;
  padding: 1.5rem;
  color: var(--well-dim);
  text-align: center;
}

@keyframes draw {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@media (max-width: 720px) {
  .chart {
    padding-left: 0.7rem;
    padding-right: 0.7rem;
  }

  svg,
  .plot {
    min-height: 13rem;
    height: 13rem;
  }

  svg {
    height: 13rem;
  }

  .x-labels span:not(.start):not(.end) {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .line {
    animation: none;
  }
}
</style>
