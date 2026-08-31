import { proxyJson } from './_upstream.js'

export default async function handler(_req, res) {
    await proxyJson(res, '/API/weather/pasthour')
}
