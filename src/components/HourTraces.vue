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
                    <template v-if="range === 'archive'">
                        <div class="group" role="tablist" aria-label="Archive window">
                            <button
                                v-for="p in presets"
                                :key="p.id"
                                type="button"
                                role="tab"
                                :aria-selected="archiveMode === p.id"
                                :class="{ on: archiveMode === p.id }"
                                @click="choosePreset(p.id)"
                            >
                                {{ p.label }}
                            </button>
                            <button
                                type="button"
                                role="tab"
                                :aria-selected="archiveMode === 'custom'"
                                :class="{ on: archiveMode === 'custom' }"
                                @click="chooseCustom()"
                            >
                                Custom
                            </button>
                        </div>
                    </template>
                    <Transition name="custom-range">
                        <div v-if="range === 'archive' && archiveMode === 'custom'" class="custom-range">
                            <label>
                                From
                                <input v-model="customFrom" type="date" :max="customTo || undefined" />
                            </label>
                            <label>
                                To
                                <input v-model="customTo" type="date" :min="customFrom || undefined" />
                            </label>
                        </div>
                    </Transition>
                </div>
            </div>
        </div>

        <TraceChart
            :key="chartKey"
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
import { computed, onUnmounted, ref, watch } from 'vue'
import TraceChart, { type ChartPoint } from './TraceChart.vue'
import { useWeather } from '@/composables/useWeather'
import { cToF, formatAxisDate, parseStamp, type WeatherReading } from '@/lib/meteo'

type SeriesId = 'temperature' | 'humidity' | 'pressure'
type RangeId = 'hour' | 'archive'
type PresetId = 'custom' | '1d' | '7d' | '30d' | '90d' | '1y'

const { hour, live, unit, queryArchive } = useWeather()
const active = ref<SeriesId>('temperature')
const range = ref<RangeId>('hour')
const archiveMode = ref<Exclude<PresetId, 'custom'> | 'custom'>('7d')
const customFrom = ref('')
const customTo = ref('')
const archiveRows = ref<WeatherReading[]>([])
const archiveLoadingDelayed = ref(false)
const archiveError = ref('')

const series: { id: SeriesId; label: string }[] = [
    { id: 'temperature', label: 'Temperature' },
    { id: 'humidity', label: 'Humidity' },
    { id: 'pressure', label: 'Pressure' },
]

const PRESET_DAYS: Record<Exclude<PresetId, 'custom'>, number> = {
    '1d': 1,
    '7d': 7,
    '30d': 30,
    '90d': 90,
    '1y': 365,
}

const presets: { id: Exclude<PresetId, 'custom'>; label: string }[] = [
    { id: '1d', label: '1 day' },
    { id: '7d', label: '7 days' },
    { id: '30d', label: '30 days' },
    { id: '90d', label: '90 days' },
    { id: '1y', label: '1 year' },
]

type ArchiveQuery = { days?: number; from?: string; to?: string; bucketHours: number }

/** Pick a bucket in hours that keeps roughly 100–200 points for the span. */
function bucketForSpanDays(days: number) {
    const hours = Math.round((Math.max(1, days) * 24) / 150)
    return Math.min(48, Math.max(1, hours))
}

function isoDay(d: Date) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
}

function parseIsoDay(value: string): number {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim())
    if (!match) return NaN
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getTime()
}

function spanDays(from: string, to: string) {
    const a = parseIsoDay(from)
    const b = parseIsoDay(to)
    if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 1
    return Math.max(1, Math.round((b - a) / 86_400_000) + 1)
}

function choosePreset(id: Exclude<PresetId, 'custom'>) {
    archiveMode.value = id
}

function chooseCustom() {
    archiveMode.value = 'custom'
    if (!customFrom.value && !customTo.value) {
        const to = new Date()
        const from = new Date(to.getTime() - 30 * 86_400_000)
        customTo.value = isoDay(to)
        customFrom.value = isoDay(from)
    }
}

const archiveQuery = computed<ArchiveQuery | null>(() => {
    if (range.value !== 'archive') return null
    if (archiveMode.value !== 'custom') {
        const days = PRESET_DAYS[archiveMode.value]
        return { days, bucketHours: bucketForSpanDays(days) }
    }
    let from = customFrom.value.trim()
    let to = customTo.value.trim()
    if (from || to) {
        const base = from || to
        const baseMs = parseIsoDay(base)
        if (Number.isFinite(baseMs)) {
            if (!from) from = isoDay(new Date(baseMs - 30 * 86_400_000))
            else if (!to) to = isoDay(new Date(baseMs + 30 * 86_400_000))
        }
    } else {
        return { days: 7, bucketHours: bucketForSpanDays(7) }
    }
    return { from, to, bucketHours: bucketForSpanDays(spanDays(from, to)) }
})

let archiveToken = 0
const dataToken = ref(0)
let loadingTimer: number | undefined
onUnmounted(() => window.clearTimeout(loadingTimer))

async function loadArchive() {
    const q = archiveQuery.value
    const token = ++archiveToken
    archiveError.value = ''
    window.clearTimeout(loadingTimer)
    if (!q) {
        archiveRows.value = []
        archiveLoadingDelayed.value = false
        return
    }
    // Keep the previous window on screen; only admit to loading if the fetch is
    // slow enough to be noticeable, so a fast one never flashes "Fetching…".
    loadingTimer = window.setTimeout(() => {
        if (token !== archiveToken) return
        if (archiveRows.value.length) archiveRows.value = []
        archiveLoadingDelayed.value = true
    }, 220)
    try {
        const rows = await queryArchive(q)
        if (token !== archiveToken) return
        window.clearTimeout(loadingTimer)
        archiveLoadingDelayed.value = false
        archiveRows.value = rows
        // Re-mount the chart only once real data is in place so the draw animation
        // runs over the freshly fetched window, not old rows. (Works for cache hits
        // too since dataToken is reactive and chartKey recomputes.)
        dataToken.value += 1
    } catch {
        if (token !== archiveToken) return
        window.clearTimeout(loadingTimer)
        archiveLoadingDelayed.value = false
        archiveRows.value = []
        archiveError.value = 'Past history is temporarily unavailable.'
    }
}

watch(archiveQuery, () => void loadArchive(), { immediate: true })

const rows = computed<WeatherReading[]>(() => {
    if (range.value === 'archive') return archiveRows.value
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

function rawValue(row: WeatherReading, id: SeriesId) {
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

const heading = computed(() => (range.value === 'archive' ? 'Station archive' : 'Last hour'))

/** Re-mount TraceChart when the series/range or freshly loaded archive window changes. */
const chartKey = computed(() =>
    range.value === 'archive' ? `archive-${active.value}-${dataToken.value}` : `hour-${active.value}`,
)

function archiveRangeLabel() {
    const tMin = Math.min(...archiveRows.value.map((r) => parseStamp(r.dstamp)))
    const tMax = Math.max(...archiveRows.value.map((r) => parseStamp(r.dstamp)))
    if (!Number.isFinite(tMin) || !Number.isFinite(tMax)) return ''
    return `${formatAxisDate(tMin)} – ${formatAxisDate(tMax)}`
}

const lede = computed(() => {
    if (range.value === 'hour') {
        const vals = points.value.map((p) => p.value).filter(Number.isFinite)
        if (!vals.length) return 'Minute samples. Move across the plot for the time and value.'
        const min = formatValue(Math.min(...vals))
        const max = formatValue(Math.max(...vals))
        return `${min}–${max} ${yLabel.value} this hour. Time runs left to right, up to the live reading.`
    }
    if (archiveLoadingDelayed.value) return 'Fetching the stored record…'
    if (archiveError.value) return archiveError.value
    const n = points.value.length
    if (!n) return 'No archived samples in that window.'
    const vals = points.value.map((p) => p.value).filter(Number.isFinite)
    const span = archiveRangeLabel()
    const window = span ? ` between ${span}` : ''
    if (!vals.length) return `${n} samples${window}. Move across the plot for the time and value.`
    const min = formatValue(Math.min(...vals))
    const max = formatValue(Math.max(...vals))
    return `${n} samples${window}, ${min}–${max} ${yLabel.value}. Time runs left to right.`
})

const aria = computed(() => {
    const n = points.value.length
    const kind = series.find((s) => s.id === active.value)?.label ?? 'Temperature'
    if (range.value === 'archive') {
        const span = archiveRangeLabel()
        return `${kind} archive chart, ${n} samples${span ? `, ${span}` : ''}. Arrow keys move the readout.`
    }
    return `${kind} chart, ${n} samples, last hour. Arrow keys move the readout.`
})

const empty = computed(() => {
    if (range.value === 'hour') return 'No samples yet.'
    if (archiveLoadingDelayed.value) return 'Fetching…'
    if (archiveError.value) return 'Unavailable right now.'
    return 'No archived samples in that window.'
})
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
    align-items: baseline;
}

.group + .group,
.group + .custom-range {
    border-left: 1px solid var(--rule);
    padding-left: 1.3rem;
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

.custom-range {
    display: flex;
    gap: 0.9rem;
    align-items: baseline;
}

.custom-range-enter-active,
.custom-range-leave-active {
    transition: opacity 0.32s var(--ease), transform 0.32s var(--ease);
}

.custom-range-enter-from,
.custom-range-leave-to {
    opacity: 0;
    transform: translateY(-4px);
}

.custom-range label {
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
    font-size: 0.82rem;
    font-weight: 500;
    color: var(--ink-dim);
}

.custom-range input {
    appearance: none;
    background: var(--paper-2);
    color: var(--ink);
    border: 1px solid var(--rule);
    border-radius: 6px;
    padding: 0.3rem 0.45rem;
    font: inherit;
    font-size: 0.86rem;
}

@media (max-width: 720px) {
    .controls,
    .group,
    .custom-range {
        width: 100%;
    }

    .group + .group,
    .group + .custom-range {
        border-left: 0;
        padding-left: 0;
    }

    .custom-range {
        flex-wrap: wrap;
    }
}
</style>