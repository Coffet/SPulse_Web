// Export progress modal — shown during the FFmpeg export pipeline.
export const progressModal = {
  _overlay:    null,
  _fill:       null,
  _stats:      null,
  _eta:        null,
  _title:      null,
  _startTs:    0,
  _onCancel:   null,
  _outputPath: null,
  _realtime:   false,

  _formatEta(seconds) {
    let s = Math.max(0, Math.ceil(seconds || 0))
    if (s < 60) return `${s}s`

    const d = Math.floor(s / 86400)
    s -= d * 86400
    const h = Math.floor(s / 3600)
    s -= h * 3600
    const m = Math.floor(s / 60)
    s -= m * 60

    if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`
    if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`
    return s > 0 ? `${m}m ${s}s` : `${m}m`
  },

  init(onCancel) {
    this._overlay  = document.getElementById('export-modal')
    this._fill     = document.getElementById('export-progress-fill')
    this._stats    = document.getElementById('export-progress-stats')
    this._eta      = document.getElementById('export-progress-eta')
    this._title    = document.getElementById('export-modal-title')
    this._onCancel = onCancel

    // Use onclick so repeated init() calls don't stack listeners
    const btnCancel = document.getElementById('btn-export-cancel')
    const btnClose  = document.getElementById('btn-export-close')
    const btnFolder = document.getElementById('btn-open-folder')
    if (btnCancel) btnCancel.onclick = () => this._onCancel?.()
    if (btnClose)  btnClose.onclick  = () => this.hide()
    if (btnFolder) btnFolder.onclick = () => {
      if (this._outputPath) window.api.revealInFolder(this._outputPath)
    }
  },

  show(totalFrames, opts = {}) {
    this._startTs    = performance.now()
    this._outputPath = null
    this._realtime   = !!opts.realtime

    if (this._title) this._title.textContent = opts.title || 'Exporting MP4…'
    document.getElementById('btn-export-cancel')?.classList.remove('hidden')
    document.getElementById('btn-export-close')?.classList.add('hidden')
    document.getElementById('btn-open-folder')?.classList.add('hidden')

    document.body.classList.add('exporting')
    this._overlay?.classList.remove('hidden')
    this.update(0, totalFrames)
  },

  update(framesDone, totalFrames) {
    const pct = totalFrames > 0 ? Math.round((framesDone / totalFrames) * 100) : 0
    if (this._fill)  this._fill.style.width = `${pct}%`
    if (this._stats) {
      this._stats.textContent = this._realtime
        ? `Recording ${pct}% — this matches the length of the song`
        : `Frame ${framesDone} / ${totalFrames} — ${pct}%`
    }

    if (framesDone > 2 && this._eta) {
      const elapsed = (performance.now() - this._startTs) / 1000
      const rate    = framesDone / elapsed
      const rem     = (totalFrames - framesDone) / Math.max(rate, 0.1)
      const eta     = this._formatEta(rem)
      this._eta.textContent = this._realtime
        ? `~${eta} remaining`
        : `~${eta} remaining  (${rate.toFixed(1)} fps)`
    }
  },

  // Restart the fps/ETA clock without touching the rest of the modal state — used
  // when a multi-second setup phase (e.g. export's video-loop pre-cache) happens
  // between show() and the actual per-frame loop, so that phase's time doesn't
  // dilute the reported rate.
  resetTimer() {
    this._startTs = performance.now()
  },

  setMessage(msg) {
    if (this._stats) this._stats.textContent = msg
    if (this._eta)   this._eta.textContent   = ''
  },

  complete(outputPath) {
    this._outputPath = outputPath
    if (this._title) this._title.textContent = 'Export Complete'
    if (this._fill)  this._fill.style.width  = '100%'
    this.setMessage(`✓ Saved: ${String(outputPath || '').replace(/.*[\\/]/, '')}`)
    document.getElementById('btn-export-cancel')?.classList.add('hidden')
    document.getElementById('btn-export-close')?.classList.remove('hidden')
    const canReveal = window.api?.platform !== 'web'
    document.getElementById('btn-open-folder')?.classList.toggle('hidden', !canReveal)
  },

  hide() {
    this._overlay?.classList.add('hidden')
    document.body.classList.remove('exporting')
    this._outputPath = null
  },
}
