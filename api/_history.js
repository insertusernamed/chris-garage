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

export async function getHistory() {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.body
  if (inflight) return inflight

  inflight = (async () => {
    const timeoutMs = process.env.VERCEL ? 52_000 : 180_000
    const raw = await getUpstream('/API/weather/past', timeoutMs)
    const rows = JSON.parse(raw)
    if (!Array.isArray(rows)) throw new Error('Unexpected history payload')

    const buckets = new Map()
    for (const row of rows) {
      if (!plausible(row)) continue
      const t = Date.parse(row.dstamp)
      if (!Number.isFinite(t)) continue
      buckets.set(Math.floor(t / BUCKET_MS), {
        temperature: Number(row.temperature),
        humidity: Number(row.humidity),
        pressure: Number(row.pressure),
        dstamp: row.dstamp,
      })
    }

    const points = [...buckets.values()].sort(
      (a, b) => Date.parse(a.dstamp) - Date.parse(b.dstamp),
    )
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
