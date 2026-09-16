'use strict'

const { test, expect, _electron } = require('@playwright/test')

// Bundled fonts (src/styles/main.css) are optional local assets, not checked
// into git — see that file's own comment. On CI, local('Inter') / local('JetBrains
// Mono') miss, Chromium fetches the woff2, and that 404s. Chromium's console
// text is only "Failed to load resource: net::ERR_FILE_NOT_FOUND" with the
// *document* URL, not the font path — so we ignore that console shape and
// fail instead on unexpected requestfailed URLs.
const isOptionalAsset = url => /(?:JetBrainsMono|Inter)\.woff2(?:\?|#|$)/.test(url || '')

test('app launches, main window renders, no console errors on startup', async () => {
  const consoleErrors = []
  const unexpectedMissing = []
  let electronApp

  try {
    electronApp = await _electron.launch({ args: ['.'] })

    const window = await electronApp.firstWindow()
    window.on('requestfailed', request => {
      const url = request.url()
      if (!isOptionalAsset(url)) unexpectedMissing.push(url)
    })
    window.on('console', msg => {
      if (msg.type() !== 'error') return
      const text = msg.text() || ''
      const url = msg.location()?.url || ''
      if (isOptionalAsset(url)) return
      if (/ERR_FILE_NOT_FOUND/.test(text)) return
      consoleErrors.push(text)
    })

    await window.waitForLoadState('domcontentloaded')
    await expect(window).toHaveTitle('SPulse')
    await expect(window.locator('body')).toBeVisible()

    expect(consoleErrors, 'unexpected console errors').toEqual([])
    expect(unexpectedMissing, 'unexpected missing files').toEqual([])
  } finally {
    await electronApp?.close()
  }
})
