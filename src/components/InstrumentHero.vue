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
                <strong
                    :id="`${fact.tipId}-v`"
                    :class="{ flash: flashes[fact.id] }"
                >{{ fact.value }}</strong>
                <span :id="fact.tipId" class="tip" role="tooltip">{{ fact.tip }}</span>
            </button>
        </div>
    </section>
</template>

<script setup lang="ts">
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import { useWeather } from '@/composables/useWeather'
import { useAnimatedNumber } from '@/composables/useAnimatedNumber'
import {
    cToF,
    conditionLine,
    dewPointC,
    dewPointLabel,
    displayTemp,
    formatStamp,
    humidex,
    parseStamp,
    tendencyFromSlope,
} from '@/lib/meteo'

const {
    unit,
    celsius,
    humidity,
    pressure,
    dew,
    hx,
    range,
    forecast,
    status,
    stampMs,
    error,
    hoverPreview,
} = useWeather()

// When a chart is hovered, mirror the reading under the cursor into the hero.
const preview = computed(() => hoverPreview.value)
const humiditySource = computed(() => (preview.value ? preview.value.humidity : humidity.value))
const pressureSource = computed(() => (preview.value ? preview.value.pressure : pressure.value))

const displayC = computed(() => {
    const c = preview.value ? preview.value.temperature : celsius.value
    if (c == null) return null
    return unit.value === 'F' ? cToF(c) : c
})
const tempShown = useAnimatedNumber(displayC, 1)
const humidityShown = useAnimatedNumber(humiditySource, 0)
const pressureShown = useAnimatedNumber(pressureSource, 1)
const dewC = computed(() => {
    if (preview.value) {
        const d = dewPointC(preview.value.temperature, preview.value.humidity)
        return Number.isFinite(d) ? d : null
    }
    return dew.value
})
const dewNumberShown = useAnimatedNumber(dewC, 1)
const dewShown = computed(() =>
    dewNumberShown.value === '—' ? '—' : `${dewNumberShown.value}°${unit.value}`,
)

// Transient green pulse on a stat card, mirroring the big temperature's flash.
const flashes = reactive<Record<string, boolean>>({})
const puffTimers: Record<string, number | undefined> = {}
const flashTimers: Record<string, number | undefined> = {}
function puff(id: string) {
    // Debounce so the pulse lands once the number settles — scrubbing across a
    // chart won't strobe, but a held hover still flashes when the value finishes.
    window.clearTimeout(puffTimers[id])
    puffTimers[id] = window.setTimeout(() => {
        flashes[id] = true
        window.clearTimeout(flashTimers[id])
        flashTimers[id] = window.setTimeout(() => {
            flashes[id] = false
        }, 680)
    }, 700)
}
onUnmounted(() => {
    for (const t of Object.values(puffTimers)) window.clearTimeout(t)
    for (const t of Object.values(flashTimers)) window.clearTimeout(t)
})

const flash = ref(false)
let flashTimer = 0
watch(displayC, (next, prev) => {
    if (next == null || prev == null || next === prev) return
    // Debounce so the pulse lands when the number settles, even while hovering.
    window.clearTimeout(flashTimer)
    flashTimer = window.setTimeout(() => {
        flash.value = true
        window.setTimeout(() => {
            flash.value = false
        }, 680)
    }, 700)
})

const shownHumidex = computed(() => {
    if (preview.value) {
        const t = preview.value.temperature
        const rh = preview.value.humidity
        if (t == null || rh == null || t < 21) return null
        const d = dewPointC(t, rh)
        if (!Number.isFinite(d)) return null
        const v = humidex(t, d)
        return v > t + 1 ? v : null
    }
    return hx.value
})
const humidexNumberShown = useAnimatedNumber(shownHumidex, 1)
const humidexShown = computed(() =>
    humidexNumberShown.value === '—' ? '—' : `${humidexNumberShown.value}°${unit.value}`,
)

const station = computed(() => {
    if (preview.value) return 'Reading at the pointer'
    if (status.value === 'offline') return 'Garage station · offline'
    if (status.value === 'stale') return 'Garage station · stale'
    return 'Garage station · SenseHAT'
})

const line = computed(() => {
    if (preview.value) {
        const t = preview.value.temperature
        const rh = preview.value.humidity
        if (t == null || rh == null) return 'Reading at the pointer.'
        return conditionLine(t, rh, forecast.value, unit.value)
    }
    if (error.value && celsius.value == null) return 'Station unreachable.'
    if (celsius.value == null || humidity.value == null) return 'Waiting on the first reading.'
    return conditionLine(celsius.value, humidity.value, forecast.value, unit.value)
})

const when = computed(() => {
    if (preview.value) {
        const ms = parseStamp(preview.value.dstamp)
        return Number.isFinite(ms) ? `Preview · ${formatStamp(ms)}` : 'Preview'
    }
    if (!stampMs.value) return 'Waiting for a timestamp.'
    return formatStamp(stampMs.value)
})

const facts = computed(() => {
    const rh = humiditySource.value
    const tipDew = preview.value != null && preview.value.humidity != null
        ? dewPointC(preview.value.temperature, preview.value.humidity)
        : dew.value
    const items = [
        {
            id: 'humidity',
            label: 'Humidity',
            value: rh == null ? '—' : `${humidityShown.value}%`,
            tip: tipDew != null
                ? `Water in the garage air. Dew point is ${dewPointLabel(tipDew)} at this temperature.`
                : 'Water in the garage air. Above about 60% here usually feels sticky.',
            tipId: 'tip-humidity',
        },
        {
            id: 'pressure',
            label: 'Pressure',
            value: pressureSource.value == null ? '—' : `${pressureShown.value} mb`,
            tip: 'Barometer in millibars. Rising often means settling weather; falling often means unsettled.',
            tipId: 'tip-pressure',
        },
        {
            id: 'dew',
            label: 'Dew point',
            value: dewShown.value,
            tip: 'Temperature where this air would saturate. Closer to room temperature means damper air.',
            tipId: 'tip-dew',
        },
        {
            id: 'hour',
            label: 'Last hour',
            value: range.value
                ? `${displayTemp(range.value.min, unit.value)}–${displayTemp(range.value.max, unit.value)}°${unit.value}`
                : '—',
            tip: 'Highest and lowest temperature persisted over the last 60 minutes.',
            tipId: 'tip-hour',
        },
    ]
    if (
        shownHumidex.value != null &&
        (preview.value ? preview.value.temperature : celsius.value) != null
    ) {
        items.push({
            id: 'humidex',
            label: 'Humidex',
            value: humidexShown.value,
            tip: 'Canadian humidex: how hot it feels once humidity is included. Shown only when the garage is warm.',
            tipId: 'tip-humidex',
        })
    } else {
        items.push({
            id: 'updated',
            label: 'Updated',
            value: preview.value
                ? Number.isFinite(parseStamp(preview.value.dstamp))
                    ? 'Pointer'
                    : '—'
                : stampMs.value
                    ? formatStamp(stampMs.value)
                    : '—',
            tip: preview.value
                ? 'What the chart cursor is reading.'
                : 'When the SenseHAT last sent a reading the station treated as live.',
            tipId: 'tip-updated',
        })
    }
    const tend = tendencyFromSlope(forecast.value?.baroSlopeHourlyLinear ?? 0)
    items.push({
        id: 'tend',
        label: 'Tendency',
        value: tend.dir === 'steady' ? 'Steady' : tend.dir === 'rising' ? 'Rising' : 'Falling',
        tip: `${tend.phrase}. Taken from the last hour of barometer slope, not a public forecast.`,
        tipId: 'tip-tend',
    })
    return items
})

// Green pulse the matching stat when its value moves.
watch(humiditySource, (next, prev) => { if (next !== prev) puff('humidity') })
watch(pressureSource, (next, prev) => { if (next !== prev) puff('pressure') })
watch(dewC, (next, prev) => { if (next !== prev) puff('dew') })
watch(shownHumidex, (next, prev) => { if (next !== prev) puff('humidex') })
watch(
    () => (range.value ? `${range.value.min},${range.value.max}` : null),
    (next, prev) => { if (next !== prev) puff('hour') },
)
watch(
    () => forecast.value?.baroSlopeHourlyLinear ?? null,
    (next, prev) => { if (next !== prev) puff('tend') },
)
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
    transition: color 0.68s var(--ease);
}

.fact strong.flash {
    color: var(--pen);
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
