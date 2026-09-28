// Project format chooser — shown by "Export Project" so the user can pick between
// a native .spx file (raw file paths, "this device") and a portable .spulse file
// (assets embedded as base64). Mirrors the confirm-dialog pattern.

let _resolver = null

function _getEls() {
  return {
    modal:     document.getElementById('project-format-modal'),
    spxBtn:    document.getElementById('project-format-spx'),
    spulseBtn: document.getElementById('project-format-spulse'),
    cancelBtn: document.getElementById('project-format-cancel'),
  }
}

function _settle(value) {
  const { modal } = _getEls()
  if (!modal || !_resolver) return
  modal.classList.add('hidden')
  const resolve = _resolver
  _resolver = null
  resolve(value)
}

export function initFormatDialog() {
  const { modal, spxBtn, spulseBtn, cancelBtn } = _getEls()
  if (!modal) return

  spxBtn?.addEventListener('click', () => _settle('spx'))
  spulseBtn?.addEventListener('click', () => _settle('spulse'))
  cancelBtn?.addEventListener('click', () => _settle(null))

  // Dismiss on backdrop click
  modal.addEventListener('click', e => {
    if (e.target === modal) _settle(null)
  })

  // Dismiss on Escape
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return
    if (modal.classList.contains('hidden')) return
    _settle(null)
  })
}

// Resolves to 'spx', 'spulse', or null when cancelled. Falls back to 'spulse' if
// the markup is somehow missing, preserving the old portable-default behavior.
export function chooseProjectFormat() {
  const { modal } = _getEls()
  if (!modal) return Promise.resolve('spulse')
  modal.classList.remove('hidden')
  return new Promise(resolve => { _resolver = resolve })
}
