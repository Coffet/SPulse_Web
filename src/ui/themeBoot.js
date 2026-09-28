/* Apply persisted theme before first paint. Must stay a classic script (not
   type=module) so it is not deferred. Landing colors are pinned in home.css.
   Default when nothing is stored: dark on desktop, OS theme on web. On desktop
   preload.js has already exposed window.api.platform; on web window.api is only
   installed later by webApi.js, so it is still undefined here. Keep in sync with
   _defaultTheme() in theme.js. */
(function () {
  try {
    var stored = localStorage.getItem('spulse-theme')
    var desktop = !!(window.api && typeof window.api.platform === 'string' && window.api.platform !== 'web')
    var theme = stored === 'light' || stored === 'dark'
      ? stored
      : desktop
        ? 'dark'
        : (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    document.documentElement.dataset.theme = theme
  } catch {
    document.documentElement.dataset.theme = 'dark'
  }
})()
