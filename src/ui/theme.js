const STORAGE_KEY = 'spulse-theme'

function _systemTheme() {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

// Desktop (Electron) defaults to dark; only the web build follows the OS theme
// until the user picks one. preload.js exposes window.api.platform ('win32',
// 'darwin', …) before any page script runs, so any value other than 'web' means
// desktop. Keep in sync with themeBoot.js.
function _isDesktop() {
  return typeof window.api?.platform === 'string' && window.api.platform !== 'web'
}

function _defaultTheme() {
  return _isDesktop() ? 'dark' : _systemTheme()
}

export function getTheme() {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
}

// Only an explicit choice (the toggle) is persisted — the default is re-derived
// on each launch, so web keeps following the OS until the user picks a theme.
export function setTheme(theme, { persist = true } = {}) {
  const next = theme === 'light' ? 'light' : 'dark'
  document.documentElement.dataset.theme = next
  if (persist) {
    try { localStorage.setItem(STORAGE_KEY, next) } catch { /* ignore quota / private mode */ }
  }
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
  if (stored === 'light' || stored === 'dark') setTheme(stored)
  else setTheme(_defaultTheme(), { persist: false })

  document.getElementById('btn-theme')?.addEventListener('click', toggleTheme)

  // Web only: follow OS theme changes until the user picks one explicitly.
  if (_isDesktop()) return
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', e => {
    try {
      if (localStorage.getItem(STORAGE_KEY)) return
    } catch { /* follow system */ }
    setTheme(e.matches ? 'light' : 'dark', { persist: false })
  })
}
