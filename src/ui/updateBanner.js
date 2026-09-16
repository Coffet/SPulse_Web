// Auto-update banner — checks happen automatically (main process, 3s after
// launch on desktop; web checks senriki/SPulse:main via /api/upstream) or
// manually via Help > Check for Updates (native menu on macOS via IPC, or the
// in-app menu bar on Windows/Linux/web via checkForUpdatesManually()).
let _triggerManualCheck = null

export function checkForUpdatesManually() {
  _triggerManualCheck?.()
}

export function initUpdateBanner() {
  const bar         = document.getElementById('update-bar')
  const msgEl       = document.getElementById('update-msg')
  const progressWrap= document.getElementById('update-progress-wrap')
  const progressFill= document.getElementById('update-progress-fill')
  const btnUpdateNow= document.getElementById('btn-update-now')
  const btnInstall  = document.getElementById('btn-update-install')
  const btnGithub   = document.getElementById('btn-update-github')
  const btnDismiss  = document.getElementById('btn-update-dismiss')
  if (!bar) return

  const isWeb = window.api?.platform === 'web'
  const DISMISSED_KEY = 'spulse-dismissed-update-version'
  // Set while a banner is showing an available-but-not-yet-downloading update —
  // dismissing in that state remembers the version so it doesn't nag again.
  let _pendingVersion = null
  // A manual "Check for Updates…" click always shows the result, even for a
  // version the user previously dismissed on auto-check.
  let _manualCheck = false

  if (isWeb && btnUpdateNow) btnUpdateNow.textContent = 'Reload'

  function _hideActions() {
    progressWrap.classList.add('hidden')
    btnUpdateNow.classList.add('hidden')
    btnInstall.classList.add('hidden')
    btnGithub?.classList.add('hidden')
  }

  function _show(msg) {
    msgEl.textContent = msg
    bar.classList.remove('hidden')
  }

  btnDismiss.addEventListener('click', () => {
    if (_pendingVersion) {
      localStorage.setItem(DISMISSED_KEY, _pendingVersion)
      _pendingVersion = null
    }
    bar.classList.add('hidden')
  })

  btnUpdateNow.addEventListener('click', () => {
    _pendingVersion = null
    if (isWeb) {
      window.api.downloadUpdate?.()
      return
    }
    btnUpdateNow.classList.add('hidden')
    btnGithub?.classList.add('hidden')
    progressWrap.classList.remove('hidden')
    msgEl.textContent = 'Downloading update… 0%'
    window.api.downloadUpdate?.()
  })

  btnInstall.addEventListener('click', () => window.api.installUpdate?.())

  let _dismissTimer = null
  function _autoDismiss(ms = 3000) {
    clearTimeout(_dismissTimer)
    _dismissTimer = setTimeout(() => bar.classList.add('hidden'), ms)
  }

  window.api.onUpdateNotAvailable?.((info) => {
    const wasManual = _manualCheck
    _manualCheck = false
    _hideActions()
    if (!wasManual) return
    _show(info?.error ? 'Could not reach senriki/SPulse' : 'Up to date')
    _autoDismiss(3000)
  })

  window.api.onUpdateAvailable?.(({ version }) => {
    clearTimeout(_dismissTimer)
    if (!_manualCheck && localStorage.getItem(DISMISSED_KEY) === version) return
    _manualCheck = false

    _pendingVersion = version
    _show(isWeb ? `Version ${version} on senriki/SPulse` : `Version ${version} available`)
    progressWrap.classList.add('hidden')
    btnInstall.classList.add('hidden')
    btnUpdateNow.classList.remove('hidden')
    btnGithub?.classList.toggle('hidden', !isWeb)
  })

  window.api.onUpdateProgress?.(({ percent }) => {
    progressFill.style.width = `${percent}%`
    msgEl.textContent = `Downloading update… ${percent}%`
  })

  window.api.onUpdateDownloaded?.(({ version }) => {
    progressWrap.classList.add('hidden')
    btnUpdateNow.classList.add('hidden')
    btnGithub?.classList.add('hidden')
    btnInstall.classList.remove('hidden')
    _show(`Update ${version} ready to install`)
  })

  function _triggerCheck() {
    _pendingVersion = null
    _manualCheck = true
    _show('Checking for updates…')
    bar.classList.remove('hidden')
    _hideActions()
    window.api.checkForUpdates?.()
  }

  window.api.onMenuCheckUpdates?.(_triggerCheck)
  _triggerManualCheck = _triggerCheck

  // Match desktop: check a few seconds after launch so startup stays snappy.
  if (isWeb) setTimeout(() => window.api.checkForUpdates?.(), 3000)
}
