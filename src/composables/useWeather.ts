import { computed, ref } from 'vue'
import {
  dewPointC,
  hourRange,
  hourRateC,
  humidex,
  isStale,
  parseStamp,
  toCelsius,
  toMillibar,
  type TempUnit,
  type WeatherForecast,
  type WeatherReading,
} from '@/lib/meteo'

const POLL_MS = 9000
const HOUR_MS = 60_000
const WS_URL = 'wss://chrisbarbati.ddns.net:2048/ws'
const UNIT_KEY = 'chris-weather-unit'
const ARCHIVE_KEY = 'chris-weather-archive-v1'
const ARCHIVE_FRESH_MS = 6 * 60 * 60 * 1000

const unit = ref<TempUnit>('C')
const live = ref<WeatherReading | null>(null)
const hour = ref<WeatherReading[]>([])
const archive = ref<WeatherReading[]>([])
const archiveMeta = ref('')
const archiveLoading = ref(false)
const archiveCachedAt = ref(0)
const forecast = ref<WeatherForecast | null>(null)
const error = ref<string | null>(null)
const connected = ref(false)
let started = false
let pollTimer: number | undefined
let hourTimer: number | undefined
let socket: WebSocket | null = null
let usingSocket = false

function finiteNumber(value: unknown) {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function plausibleIndoor(c: number, rh: number, mb: number) {
  return c > -20 && c < 48 && rh >= 0 && rh <= 100 && mb > 850 && mb < 1100
}

function normalize(raw: WeatherReading): WeatherReading | null {
  const temperature = toCelsius(finiteNumber(raw.temperature) ?? NaN, raw.tempUnit)
  const humidity = finiteNumber(raw.humidity)
  const pressure = toMillibar(finiteNumber(raw.pressure) ?? NaN, raw.pressureUnit)
  if (
    humidity == null ||
    !Number.isFinite(temperature) ||
    !Number.isFinite(pressure) ||
    !plausibleIndoor(temperature, humidity, pressure)
  ) {
    return null
  }
  return {
    temperature,
    humidity,
    pressure,
    dstamp: raw.dstamp,
    tempUnit: 'CELSIUS',
    pressureUnit: 'MILLIBAR',
  }
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<T>
}

async function pullLive(retries = 0): Promise<void> {
  try {
    const raw = await fetchJson<WeatherReading>('/api/weather')
    const next = normalize(raw)
    if (!next) throw new Error('implausible reading')
    live.value = next
    error.value = null
    connected.value = true
  } catch {
    if (retries > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, 450))
      return pullLive(retries - 1)
    }
    if (!live.value) {
      error.value = 'station unreachable'
      connected.value = false
    }
  }
}

async function pullHour() {
  try {
    const raw = await fetchJson<WeatherReading[]>('/api/pasthour')
    hour.value = (Array.isArray(raw) ? raw : [])
      .map(normalize)
      .filter((row): row is WeatherReading => row != null)
  } catch {
    /* keep last hour */
  }
}

function applyArchive(
  points: WeatherReading[],
  sourceCount?: number,
  cachedAt = Date.now(),
) {
  archive.value = points
    .map(normalize)
    .filter((row): row is WeatherReading => row != null)
  archiveCachedAt.value = cachedAt
  archiveMeta.value = sourceCount
    ? `Thinned from ${sourceCount.toLocaleString()} stored readings.`
    : ''
}

function hydrateArchive() {
  try {
    const raw = localStorage.getItem(ARCHIVE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as {
      at?: number
      sourceCount?: number
      points?: WeatherReading[]
    }
    if (!Array.isArray(parsed.points) || !parsed.points.length) return
    applyArchive(parsed.points, parsed.sourceCount, parsed.at ?? 0)
  } catch {
    /* ignore a bad cache */
  }
}

function persistArchive(points: WeatherReading[], sourceCount?: number) {
  try {
    localStorage.setItem(
      ARCHIVE_KEY,
      JSON.stringify({ v: 1, at: Date.now(), sourceCount, points }),
    )
  } catch {
    /* quota */
  }
}

async function pullHistory(force = false) {
  if (archiveLoading.value) return
  const fresh =
    archive.value.length > 0 && Date.now() - archiveCachedAt.value < ARCHIVE_FRESH_MS
  if (!force && fresh) return
  const had = archive.value.length > 0
  archiveLoading.value = true
  if (!had) archiveMeta.value = 'Fetching the stored record…'
  try {
    const data = await fetchJson<{
      sourceCount?: number
      points?: WeatherReading[]
    }>('/api/history')
    const points = Array.isArray(data.points) ? data.points : []
    applyArchive(points, data.sourceCount)
    persistArchive(archive.value, data.sourceCount)
  } catch {
    if (!had) archiveMeta.value = 'Older history is unavailable right now.'
  } finally {
    archiveLoading.value = false
  }
}

async function pullForecast() {
  try {
    forecast.value = await fetchJson<WeatherForecast>('/api/forecast')
  } catch {
    /* keep last forecast */
  }
}

function openSocket() {
  try {
    socket = new WebSocket(WS_URL)
  } catch {
    return
  }
  socket.addEventListener('open', () => {
    usingSocket = true
    connected.value = true
  })
  socket.addEventListener('message', (event) => {
    try {
      const raw = JSON.parse(String(event.data)) as WeatherReading
      const next = normalize(raw)
      if (!next) return
      live.value = next
      error.value = null
      connected.value = true
    } catch {
      /* ignore a bad frame */
    }
  })
  socket.addEventListener('error', () => {
    usingSocket = false
    socket?.close()
  })
  socket.addEventListener('close', () => {
    usingSocket = false
    socket = null
  })
}

function start() {
  if (started) return
  started = true
  const saved = localStorage.getItem(UNIT_KEY)
  if (saved === 'C' || saved === 'F') unit.value = saved
  void pullLive(2)
  void pullHour()
  void pullForecast()
  openSocket()
  pollTimer = window.setInterval(() => {
    void pullLive()
  }, POLL_MS)
  hourTimer = window.setInterval(() => {
    void pullHour()
    void pullForecast()
  }, HOUR_MS)
}

function stop() {
  if (pollTimer) window.clearInterval(pollTimer)
  if (hourTimer) window.clearInterval(hourTimer)
  socket?.close()
  started = false
}

export function useWeather() {
  if (typeof window !== 'undefined') start()

  const stampMs = computed(() => parseStamp(live.value?.dstamp ?? ''))
  const stale = computed(() => {
    if (error.value && !live.value) return true
    if (!live.value) return false
    return isStale(stampMs.value)
  })
  const status = computed(() => {
    if (error.value && !live.value) return 'offline'
    if (stale.value) return 'stale'
    if (connected.value && live.value) return 'live'
    return 'loading'
  })
  const celsius = computed(() => live.value?.temperature ?? null)
  const humidity = computed(() => live.value?.humidity ?? null)
  const pressure = computed(() => live.value?.pressure ?? null)
  const dew = computed(() =>
    celsius.value != null && humidity.value != null
      ? dewPointC(celsius.value, humidity.value)
      : null,
  )
  const hx = computed(() => {
    if (celsius.value == null || dew.value == null) return null
    if (celsius.value < 21) return null
    const value = humidex(celsius.value, dew.value)
    return value > celsius.value + 1 ? value : null
  })
  const range = computed(() => hourRange(hour.value))
  const rate = computed(() => hourRateC(hour.value))

  function setUnit(next: TempUnit) {
    unit.value = next
    localStorage.setItem(UNIT_KEY, next)
  }

  return {
    unit,
    live,
    hour,
    archive,
    archiveMeta,
    archiveLoading,
    forecast,
    error,
    status,
    stampMs,
    stale,
    celsius,
    humidity,
    pressure,
    dew,
    hx,
    range,
    rate,
    setUnit,
    pullHistory,
    start,
    stop,
  }
}
