// About — Help > About (native menu on macOS via IPC, in-app menu elsewhere).
export function showAbout() {
  const modal = document.getElementById('about-modal')
  if (!modal) return
  modal.classList.remove('hidden')
  document.getElementById('about-modal-close')?.focus()
}

export function initAboutScreen() {
  const modal = document.getElementById('about-modal')
  if (!modal) return

  const close = () => modal.classList.add('hidden')
  modal.querySelectorAll('[data-about-close]').forEach(btn => {
    btn.addEventListener('click', close)
  })
  modal.addEventListener('click', e => { if (e.target === modal) close() })

  window.api.getAppVersion?.().then(v => {
    const el = document.getElementById('about-version')
    if (el && v) el.textContent = `v${v}`
  })

  window.api.onShowAbout?.(showAbout)
}
