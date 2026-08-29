import { getHistory } from './_history.js'

export const config = { maxDuration: 60 }

export default async function handler(_req, res) {
  res.setHeader('Cache-Control', 'public, max-age=120')
  try {
    const body = await getHistory()
    res.status(200).json(body)
  } catch {
    res.status(502).json({ error: 'history unavailable' })
  }
}
