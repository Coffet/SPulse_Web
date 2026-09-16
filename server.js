'use strict'

const path = require('path')
const express = require('express')
const compression = require('compression')
const pkg = require('./package.json')

const PORT = Number(process.env.PORT) || 3000
const SRC = path.join(__dirname, 'src')

const app = express()
app.disable('x-powered-by')
app.use(compression())

app.get('/api/version', (_req, res) => {
  res.json({ version: pkg.version })
})

app.use(express.static(SRC, {
  extensions: ['html'],
  setHeaders(res, filePath) {
    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'text/javascript; charset=utf-8')
    }
  },
}))

app.use((_req, res) => {
  res.sendFile(path.join(SRC, 'index.html'))
})

app.listen(PORT, () => {
  console.log(`SPulse web  http://localhost:${PORT}  (v${pkg.version})`)
})
