'use strict'

const { chromium } = require('playwright')
const path = require('path')
const fs = require('fs')

const OUT = path.join(__dirname, '..', 'debug', 'ui-verify')
fs.mkdirSync(OUT, { recursive: true })

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = []
  page.on('pageerror', err => errors.push(String(err)))
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text())
  })

  await page.addInitScript(() => localStorage.setItem('spulse-theme', 'light'))
  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#home-new')
  const landingVisible = await page.locator('#home-screen').isVisible()
  const studioHidden = await page.locator('#studio').isHidden()
  await page.screenshot({ path: path.join(OUT, '01-landing.png'), fullPage: true })

  await page.click('#home-new')
  await page.waitForSelector('#studio:not([hidden])')
  await page.waitForTimeout(400)
  const fpsColor = await page.$eval('#fps-counter', el => getComputedStyle(el).color)
  await page.screenshot({ path: path.join(OUT, '02-studio-look.png') })

  const ids = [
    'style-picker', 'waveform-color', 'btn-export', 'btn-play-pause',
    'btn-undo', 'btn-redo', 'btn-theme', 'studio-track',
    'left-panel', 'right-panel', 'overlay-enabled', 'btn-open-audio',
    'toggle-right-panel',
  ]
  const missing = []
  for (const id of ids) {
    if (!(await page.$(`#${id}`))) missing.push(id)
  }

  await page.click('.tab-btn[data-tab="scene"]')
  await page.waitForTimeout(200)
  await page.screenshot({ path: path.join(OUT, '03-studio-scene.png') })

  await page.click('.tab-btn[data-tab="export"]')
  await page.waitForTimeout(200)
  await page.screenshot({ path: path.join(OUT, '04-studio-export.png') })

  await page.click('#btn-theme')
  await page.waitForTimeout(250)
  const theme = await page.getAttribute('html', 'data-theme')
  await page.screenshot({ path: path.join(OUT, '05-studio-light.png') })

  await page.click('#toggle-right-panel')
  await page.waitForTimeout(250)
  await page.screenshot({ path: path.join(OUT, '06-studio-collapsed.png') })

  await page.setViewportSize({ width: 900, height: 800 })
  await page.waitForTimeout(200)
  await page.screenshot({ path: path.join(OUT, '07-studio-narrow.png') })

  await browser.close()

  const report = {
    landingVisible,
    studioHiddenOnLoad: studioHidden,
    themeAfterToggle: theme,
    fpsColor,
    missingIds: missing,
    pageErrors: errors.filter(e => !/ERR_FILE_NOT_FOUND|woff2/i.test(e)),
  }
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  if (!landingVisible || !studioHidden || missing.length || report.pageErrors.length) {
    process.exitCode = 1
  }
})().catch(err => {
  console.error(err)
  process.exit(1)
})
