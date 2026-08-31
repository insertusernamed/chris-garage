import { getUpstream } from './_upstream.js'

let cache = null
let inflight = null
const TTL_MS = 30 * 60 * 1000
const BUCKET_MS = 3 * 60 * 60 * 1000

function plausible(row) {
  const t = Number(row.temperature)
  const h = Number(row.humidity)
  const p = Number(row.pressure)
  if (![t, h, p].every(Number.isFinite)) return false
  if (t <= -20 || t >= 48) return false
  if (h < 0 || h > 100) return false
  if (p > 0 && p < 40) return false
  if (p < 850 || p > 1100) return false
  return true
}

// Rows come back newest-first; keeping the first row seen in each bucket retains
// the newest sample in that window.
function bucketSample(rows, bucketMs) {
  const seen = new Map()
  for (const row of rows) {
    const t = Date.parse(row.dstamp)
    if (!Number.isFinite(t)) continue
    const key = Math.floor(t / bucketMs)
    if (!seen.has(key)) seen.set(key, row)
  }
  return [...seen.values()]
}

export async function getHistory() {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.body
  if (inflight) return inflight

  inflight = (async () => {
    const timeoutMs = process.env.VERCEL ? 52_000 : 180_000
    const raw = await getUpstream('/API/weather/past', timeoutMs)
    const rows = JSON.parse(raw)
    if (!Array.isArray(rows)) throw new Error('Unexpected history payload')

    const points = bucketSample(rows.filter(plausible), BUCKET_MS)
    // Oldest first, matching the original whole-history feed.
    points.sort((a, b) => Date.parse(a.dstamp) - Date.parse(b.dstamp))
    const body = {
      sourceCount: rows.length,
      count: points.length,
      from: points[0]?.dstamp ?? null,
      to: points.length ? points[points.length - 1].dstamp : null,
      points,
    }
    cache = { at: Date.now(), body }
    return body
  })().finally(() => {
    inflight = null
  })

  return inflight
}

/**
 * Past weather over a window, optionally sampled to a coarser resolution.
 *
 * The WeatherServer `/API/weather/past` PR added the ability to pass
 * `bucket-hours`, `days`, and calendar `from`/`to` (yyyy-MM-dd). Sampling happens
 * in SQL on the Pi. As a safety net against an upstream that ignores the params,
 * we downsample on this side too so the payload never exceeds the requested
 * resolution.
 *
 * @param {object} opts
 * @param {string|number} [opts.days] last N days
 * @param {string} [opts.from] inclusive start date (yyyy-MM-dd)
 * @param {string} [opts.to] inclusive end date (yyyy-MM-dd)
 * @param {string|number} [opts.bucketHours] bucket width in hours; 0/absent keeps every stored row
 * @returns {Promise<{sourceCount:number, count:number, points:Array}>} newest-first
 */
export async function getPastRange({ days, from, to, bucketHours = 0 } = {}) {
  const params = new URLSearchParams()
  const bh = Number(bucketHours)
  if (Number.isFinite(bh) && bh > 0) params.set('bucket-hours', String(Math.floor(bh)))
  const n = Number(days)
  if (Number.isFinite(n) && n > 0) params.set('days', String(Math.floor(n)))
  if (from) params.set('from', String(from))
  if (to) params.set('to', String(to))

  const q = params.toString()
  const timeoutMs = process.env.VERCEL ? 52_000 : 180_000
  const raw = await getUpstream(q ? `/API/weather/past?${q}` : '/API/weather/past', timeoutMs)
  const rows = JSON.parse(raw)
  if (!Array.isArray(rows)) throw new Error('Unexpected archive payload')

  const plausibleRows = rows.filter(plausible)
  const points = bh > 0 ? bucketSample(plausibleRows, bh * 3600_000) : plausibleRows
  return { sourceCount: rows.length, count: points.length, points }
}