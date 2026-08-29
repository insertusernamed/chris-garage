import https from 'node:https'
import zlib from 'node:zlib'

const UPSTREAM = 'https://chrisbarbati.ddns.net:2048'

function decodeBody(res, chunks) {
  let buf = Buffer.concat(chunks)
  const encoding = String(res.headers['content-encoding'] || '')
  if (encoding.includes('gzip')) buf = zlib.gunzipSync(buf)
  else if (encoding.includes('deflate')) buf = zlib.inflateSync(buf)
  return buf.toString('utf8')
}

export function getUpstream(path, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (err, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (err) reject(err)
      else resolve(value)
    }

    const req = https.get(
      `${UPSTREAM}${path}`,
      {
        rejectUnauthorized: false,
        headers: { 'Accept-Encoding': 'gzip, deflate' },
      },
      (res) => {
        const chunks = []
        res.on('data', (chunk) => {
          chunks.push(chunk)
        })
        res.on('end', () => {
          try {
            const status = res.statusCode ?? 502
            const body = decodeBody(res, chunks)
            if (status >= 400) {
              finish(new Error(`Upstream ${status}`))
              return
            }
            finish(null, body)
          } catch (err) {
            finish(err)
          }
        })
        res.on('error', (err) => finish(err))
      },
    )

    const timer = setTimeout(() => {
      req.destroy()
      finish(new Error('Upstream timeout'))
    }, timeoutMs)

    req.on('error', (err) => finish(err))
  })
}

export async function proxyJson(res, path) {
  res.setHeader('Cache-Control', 'no-store')
  try {
    const body = await getUpstream(path)
    res.setHeader('Content-Type', 'application/json')
    res.status(200).send(body)
  } catch {
    res.status(502).json({ error: 'station unreachable' })
  }
}
