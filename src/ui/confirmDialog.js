// Generic in-app confirm dialog (modal-overlay style) used instead of
// native window.confirm so prompts match the rest of SPulse UI.

let _resolver = null
let _returnFocus = null

function _getEls() {
  return {
    modal: document.getElementById('confirm-modal'),
    title: document.getElementById('confirm-modal-title'),
    msg: document.getElementById('confirm-modal-msg'),
    confirmBtn: document.getElementById('confirm-modal-confirm'),
    cancelBtn: document.getElementById('confirm-modal-cancel'),
  }
}

function _settle(value) {
  const { modal } = _getEls()
  if (!modal || !_resolver) return
  modal.classList.add('hidden')
  const resolve = _resolver
  _resolver = null
  _returnFocus?.focus?.()
  _returnFocus = null
  resolve(value)
}

export function initConfirmDialog() {
  const { modal, confirmBtn, cancelBtn } = _getEls()
  if (!modal) return

  confirmBtn?.addEventListener('click', () => _settle(true))
  cancelBtn?.addEventListener('click', () => _settle(false))

  // Dismiss on backdrop click
  modal.addEventListener('click', e => {
    if (e.target === modal) _settle(false)
  })

  // Dismiss on Escape
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return
    if (modal.classList.contains('hidden')) return
    _settle(false)
  })

  document.addEventListener('keydown', e => {
    if (e.key !== 'Tab' || modal.classList.contains('hidden')) return
    const focusable = [cancelBtn, confirmBtn].filter(Boolean)
    if (!focusable.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  })
}

export function showConfirmDialog({
  title = 'Confirm',
  message = '',
  confirmLabel = 'OK',
  cancelLabel = 'Cancel',
  confirmDestructive = false,
} = {}) {
  const { modal, title: titleEl, msg, confirmBtn, cancelBtn } = _getEls()
  if (!modal || !confirmBtn || !cancelBtn) {
    return Promise.resolve(window.confirm(message || title))
  }

  titleEl.textContent = title
  msg.textContent = message
  confirmBtn.textContent = confirmLabel
  cancelBtn.textContent = cancelLabel

  confirmBtn.classList.toggle('btn-destructive', !!confirmDestructive)
  confirmBtn.classList.toggle('btn-secondary', !confirmDestructive)

  _returnFocus = document.activeElement
  modal.classList.remove('hidden')
  cancelBtn.focus()

  return new Promise(resolve => {
    _resolver = resolve
  })
}
