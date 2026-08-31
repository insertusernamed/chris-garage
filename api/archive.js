import { getPastRange } from './_history.js'

export const config = { maxDuration: 60 }

function scalar(value) {
  return Array.isArray(value) ? value[value.length - 1] : value
}

export default async function handler(req, res) {
  // Mirrors upstream /API/weather/past shape: a plain newest-first array.
  res.setHeader('Cache-Control', 'public, max-age=120')
  const query = req.query ?? {}
  try {
    const body = await getPastRange({
      days: scalar(query.days),
      from: scalar(query.from),
      to: scalar(query.to),
      bucketHours: scalar(query['bucket-hours']),
    })
    res.status(200).json(body.points)
  } catch {
    res.status(502).json({ error: 'archive unavailable' })
  }
}