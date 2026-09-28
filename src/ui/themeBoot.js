/* Apply persisted theme before first paint. Must stay a classic script (not
   type=module) so it is not deferred. Landing colors are pinned in home.css. */
(function () {
  try {
    var stored = localStorage.getItem('spulse-theme')
    var theme = stored === 'light' || stored === 'dark'
      ? stored
      : (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    document.documentElement.dataset.theme = theme
  } catch {
    document.documentElement.dataset.theme = 'dark'
  }
})()
