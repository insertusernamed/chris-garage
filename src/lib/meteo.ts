export type TempUnit = 'C' | 'F'

export type WeatherReading = {
  temperature: number
  humidity: number
  pressure: number
  dstamp: string | number
  tempUnit?: string
  pressureUnit?: string
}

export type WeatherForecast = {
  date: string
  baroSlopeHourlyLinear: number
  baroSlopeHourlyQuadratic: number
}

export type Tendency = {
  dir: 'rising' | 'falling' | 'steady'
  phrase: string
}

const ZONE = 'America/Toronto'

export function parseStamp(value: string | number | undefined): number {
  if (value == null) return NaN
  if (typeof value === 'number') return value > 1e12 ? value : value * 1000
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : NaN
}

export function toCelsius(temp: number, unit?: string) {
  const u = (unit ?? 'CELSIUS').toUpperCase()
  if (u.startsWith('F')) return ((temp - 32) * 5) / 9
  if (u.startsWith('K')) return temp - 273.15
  return temp
}

export function toMillibar(pressure: number, unit?: string) {
  const u = (unit ?? 'MILLIBAR').toUpperCase()
  if (u.includes('PSI')) return pressure * 68.9475729
  // Chris's WeatherBuilder can stick on PSI after a parameterized request.
  if (pressure > 0 && pressure < 40) return pressure * 68.9475729
  return pressure
}

export function cToF(c: number) {
  return (c * 9) / 5 + 32
}

export function displayTemp(c: number, unit: TempUnit) {
  const value = unit === 'F' ? cToF(c) : c
  return value.toFixed(1)
}

export function displayDew(c: number, unit: TempUnit) {
  return `${displayTemp(c, unit)}°${unit}`
}

/** Magnus / Alduchov–Eskridge dew point in °C. */
export function dewPointC(tC: number, rh: number) {
  if (!Number.isFinite(tC) || !Number.isFinite(rh) || rh <= 0) return NaN
  const a = 17.625
  const b = 243.04
  const ratio = Math.max(0.01, Math.min(100, rh)) / 100
  const gamma = Math.log(ratio) + (a * tC) / (b + tC)
  return (b * gamma) / (a - gamma)
}

/** Absolute humidity in g/m³. */
export function absoluteHumidity(tC: number, rh: number) {
  const e = (6.112 * Math.exp((17.67 * tC) / (tC + 243.5)) * Math.max(0, rh)) / 100
  return (e * 2.1674) / (273.15 + tC)
}

/** Canadian humidex. */
export function humidex(tC: number, dewC: number) {
  const e = 6.11 * Math.exp(5417.753 * (1 / 273.16 - 1 / (dewC + 273.16)))
  return tC + 0.5555 * (e - 10)
}

export function dewPointLabel(dewC: number) {
  if (dewC < 10) return 'dry'
  if (dewC < 16) return 'comfortable'
  if (dewC < 18) return 'a bit humid'
  if (dewC < 21) return 'sticky'
  return 'oppressive'
}

export function tendencyFromSlope(mbPerHour: number): Tendency {
  if (!Number.isFinite(mbPerHour) || Math.abs(mbPerHour) < 0.12) {
    return { dir: 'steady', phrase: 'pressure steady, little change' }
  }
  if (mbPerHour >= 0.8) return { dir: 'rising', phrase: 'pressure rising, fair' }
  if (mbPerHour > 0) return { dir: 'rising', phrase: 'pressure rising slowly, fair' }
  if (mbPerHour <= -0.8) return { dir: 'falling', phrase: 'pressure falling, unsettled' }
  return { dir: 'falling', phrase: 'pressure falling slowly' }
}

export function conditionLine(
  tC: number,
  rh: number,
  forecast: WeatherForecast | null,
  unit: TempUnit,
) {
  const tend = tendencyFromSlope(forecast?.baroSlopeHourlyLinear ?? 0)
  if (!Number.isFinite(tC) || !Number.isFinite(rh)) return tend.phrase
  const dew = dewPointC(tC, rh)
  if (!Number.isFinite(dew)) return tend.phrase
  return `Dew point ${displayTemp(dew, unit)}°${unit} · ${tend.phrase}`
}

export function formatStamp(ms: number) {
  if (!Number.isFinite(ms)) return '—'
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(ms)
}

export function formatAxisTime(ms: number) {
  if (!Number.isFinite(ms)) return ''
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONE,
    hour: 'numeric',
    minute: '2-digit',
  }).format(ms)
}

export function formatAxisDate(ms: number) {
  if (!Number.isFinite(ms)) return ''
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONE,
    month: 'short',
    day: 'numeric',
  }).format(ms)
}

export function formatTooltipTime(ms: number) {
  if (!Number.isFinite(ms)) return '—'
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(ms)
}

export function hourRange(samples: WeatherReading[]) {
  if (!samples.length) return null
  const temps = samples.map((s) => s.temperature)
  return {
    min: Math.min(...temps),
    max: Math.max(...temps),
  }
}

export function hourRateC(samples: WeatherReading[]) {
  if (samples.length < 2) return null
  const sorted = [...samples].sort((a, b) => parseStamp(a.dstamp) - parseStamp(b.dstamp))
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const dtH = (parseStamp(last.dstamp) - parseStamp(first.dstamp)) / 3_600_000
  if (dtH < 0.05) return null
  return (last.temperature - first.temperature) / dtH
}

export function isStale(ms: number, now = Date.now()) {
  return !Number.isFinite(ms) || now - ms > 120_000
}

/** Round a min/max window onto a readable tick sequence. */
export function niceScale(min: number, max: number, count = 4, minSpan = 0) {
  let lo = min
  let hi = max
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    return { min: 0, max: 1, ticks: [0, 1] }
  }
  if (hi < lo) [lo, hi] = [hi, lo]
  if (hi - lo < minSpan) {
    const mid = (hi + lo) / 2
    lo = mid - minSpan / 2
    hi = mid + minSpan / 2
  }
  if (hi === lo) {
    const pad = Math.abs(lo) < 1 ? 0.5 : Math.abs(lo) * 0.04
    lo -= pad
    hi += pad
  }
  const span = hi - lo
  const raw = span / Math.max(1, count)
  const pow = 10 ** Math.floor(Math.log10(raw))
  const err = raw / pow
  const step = err >= 7.5 ? 10 * pow : err >= 3 ? 5 * pow : err >= 1.5 ? 2 * pow : pow
  const niceMin = Math.floor(lo / step) * step
  const niceMax = Math.ceil(hi / step) * step
  const ticks: number[] = []
  for (let value = niceMin; value <= niceMax + step * 0.5; value += step) {
    ticks.push(Number(value.toFixed(8)))
  }
  return { min: niceMin, max: niceMax, ticks }
}

export type SeriesKey = 'temperature' | 'humidity' | 'pressure'

export type ProjectedPoint = { t: number; value: number }

const clockFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

export function dayFractionToronto(ms: number) {
  let hour = 0
  let minute = 0
  for (const part of clockFmt.formatToParts(new Date(ms))) {
    if (part.type === 'hour') hour = Number(part.value)
    if (part.type === 'minute') minute = Number(part.value)
  }
  return (hour + minute / 60) / 24
}

function climatology(rows: ProjectedPoint[], bins = 48) {
  const sums = new Array(bins).fill(0)
  const counts = new Array(bins).fill(0)
  for (const row of rows) {
    if (!Number.isFinite(row.t) || !Number.isFinite(row.value)) continue
    const i = Math.min(bins - 1, Math.floor(dayFractionToronto(row.t) * bins))
    sums[i] += row.value
    counts[i] += 1
  }
  const mean = sums.map((sum, i) => (counts[i] ? sum / counts[i] : NaN))
  let last = mean.find((value) => Number.isFinite(value))
  if (last == null) return mean
  const filled = [...mean]
  for (let i = 0; i < bins * 2; i++) {
    const idx = i % bins
    if (Number.isFinite(mean[idx])) last = mean[idx]
    else filled[idx] = last
  }
  return filled
}

function climateAt(mean: number[], frac: number) {
  const n = mean.length
  const x = (((frac % 1) + 1) % 1) * n
  const i = Math.floor(x) % n
  const j = (i + 1) % n
  const a = mean[i]
  const b = mean[j]
  if (!Number.isFinite(a)) return b
  if (!Number.isFinite(b)) return a
  return a + (b - a) * (x - i)
}

function slopePerHour(samples: ProjectedPoint[], key: SeriesKey) {
  if (samples.length < 2) return 0
  const tMax = samples[samples.length - 1].t
  let window = samples.filter((s) => tMax - s.t <= 20 * 60_000)
  if (window.length < 4) window = samples.slice(-12)
  const n = window.length
  if (n < 2) return 0
  const t0 = window[0].t
  let sumT = 0
  let sumV = 0
  let sumTT = 0
  let sumTV = 0
  for (const s of window) {
    const x = (s.t - t0) / 3_600_000
    sumT += x
    sumV += s.value
    sumTT += x * x
    sumTV += x * s.value
  }
  const den = n * sumTT - sumT * sumT
  if (Math.abs(den) < 1e-9) return 0
  const slope = (n * sumTV - sumT * sumV) / den
  if (!Number.isFinite(slope)) return 0
  const cap = key === 'pressure' ? 2.4 : key === 'humidity' ? 8 : 4
  return Math.max(-cap, Math.min(cap, slope))
}

function clampProjected(key: SeriesKey, value: number) {
  if (key === 'humidity') return Math.max(0, Math.min(100, value))
  if (key === 'pressure') return Math.max(920, Math.min(1060, value))
  return Math.max(-15, Math.min(42, value))
}

/** Next hours from the typical garage day in the archive, mixed with the recent slope. */
export function projectSeries(
  observed: ProjectedPoint[],
  archive: ProjectedPoint[],
  key: SeriesKey,
  horizonMs: number,
  stepMs: number,
): ProjectedPoint[] {
  if (observed.length < 2 || horizonMs <= 0 || stepMs <= 0) return []
  const now = observed[observed.length - 1]
  const climate = climatology(archive.length > 24 ? archive : observed)
  const slope = slopePerHour(observed, key)
  const climateNow = climateAt(climate, dayFractionToronto(now.t))
  const out: ProjectedPoint[] = []
  for (let dt = stepMs; dt <= horizonMs + 1; dt += stepMs) {
    const t = now.t + dt
    const persist = now.value + slope * (dt / 3_600_000)
    let value = persist
    if (Number.isFinite(climateNow)) {
      const climateThen = climateAt(climate, dayFractionToronto(t))
      if (Number.isFinite(climateThen)) {
        value = 0.64 * (now.value + (climateThen - climateNow)) + 0.36 * persist
      }
    }
    out.push({ t, value: clampProjected(key, value) })
  }
  return out
}

/** Interior timestamps for vertical grid lines, excluding the window ends. */
export function timeTicks(tMin: number, tMax: number, longTime: boolean) {
  if (!Number.isFinite(tMin) || !Number.isFinite(tMax) || tMax <= tMin) return []
  const span = tMax - tMin
  const day = 86_400_000
  let step: number
  if (longTime) {
    if (span > 180 * day) step = 30 * day
    else if (span > 40 * day) step = 7 * day
    else if (span > 4 * day) step = day
    else step = 6 * 3_600_000
  } else {
    step = span > 50 * 60 * 1000 ? 15 * 60 * 1000 : 10 * 60 * 1000
  }
  const edge = Math.max(step * 0.45, span * 0.12)
  const first = Math.ceil((tMin + edge) / step) * step
  const ticks: number[] = []
  for (let t = first; t <= tMax - edge; t += step) ticks.push(t)
  if (ticks.length <= 6) return ticks
  const pick = [0, Math.floor((ticks.length - 1) / 2), ticks.length - 1]
  return [...new Set(pick.map((i) => ticks[i]))]
}
