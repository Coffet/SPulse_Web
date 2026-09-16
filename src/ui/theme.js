const STORAGE_KEY = 'spulse-theme'

function _systemTheme() {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function getTheme() {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
}

export function setTheme(theme) {
  const next = theme === 'light' ? 'light' : 'dark'
  document.documentElement.dataset.theme = next
  try { localStorage.setItem(STORAGE_KEY, next) } catch { /* ignore quota / private mode */ }
  _syncToggle(next)
}

export function toggleTheme() {
  setTheme(getTheme() === 'dark' ? 'light' : 'dark')
}

function _syncToggle(theme) {
  const btn = document.getElementById('btn-theme')
  if (!btn) return
  const dark = theme === 'dark'
  btn.setAttribute('aria-pressed', dark ? 'true' : 'false')
  btn.title = dark ? 'Switch to light mode' : 'Switch to dark mode'
  btn.setAttribute('aria-label', btn.title)
  btn.querySelector('.icon-theme-sun')?.classList.toggle('hidden', dark)
  btn.querySelector('.icon-theme-moon')?.classList.toggle('hidden', !dark)
}

export function initTheme() {
  const stored = (() => {
    try { return localStorage.getItem(STORAGE_KEY) } catch { return null }
  })()
  const theme = stored === 'light' || stored === 'dark' ? stored : _systemTheme()
  setTheme(theme)

  document.getElementById('btn-theme')?.addEventListener('click', toggleTheme)

  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', e => {
    try {
      if (localStorage.getItem(STORAGE_KEY)) return
    } catch { /* follow system */ }
    setTheme(e.matches ? 'light' : 'dark')
  })
}
