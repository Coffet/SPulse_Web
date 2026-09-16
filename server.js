'use strict'

const path = require('path')
const express = require('express')
const compression = require('compression')
const pkg = require('./package.json')

const PORT = Number(process.env.PORT) || 3000
const SRC = path.join(__dirname, 'src')
const UPSTREAM_PKG = 'https://raw.githubusercontent.com/senriki/SPulse/main/package.json'
const UPSTREAM_TTL_MS = 5 * 60 * 1000

const app = express()
app.disable('x-powered-by')
app.use(compression())

app.get('/api/version', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  res.json({ version: pkg.version })
})

let _upstreamCache = { at: 0, body: null }

app.get('/api/upstream', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  if (_upstreamCache.body && Date.now() - _upstreamCache.at < UPSTREAM_TTL_MS) {
    res.json(_upstreamCache.body)
    return
  }
  try {
    const r = await fetch(UPSTREAM_PKG, {
      headers: { 'User-Agent': 'SPulse-web', Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
    if (!r.ok) throw new Error(`upstream ${r.status}`)
    const remote = await r.json()
    const body = {
      version: String(remote.version || ''),
      source: 'senriki/SPulse:main',
    }
    _upstreamCache = { at: Date.now(), body }
    res.json(body)
  } catch {
    res.status(502).json({ error: 'Could not reach senriki/SPulse' })
  }
})

app.use(express.static(SRC, {
  extensions: ['html'],
  setHeaders(res, filePath) {
    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'text/javascript; charset=utf-8')
    }
    if (/\.(html|js|css)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'no-cache')
    }
  },
}))

app.use((_req, res) => {
  res.sendFile(path.join(SRC, 'index.html'))
})

app.listen(PORT, (err) => {
  if (err) {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Stop the other Node process, then start again.`)
    } else {
      console.error(err)
    }
    process.exit(1)
  }
  console.log(`SPulse web  http://localhost:${PORT}  (v${pkg.version})`)
})
