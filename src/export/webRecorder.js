// In-browser video export via MediaRecorder (WebM).
// Records the live canvas + decoded audio in real time — a 3-minute track
// takes about 3 minutes. Desktop FFmpeg remains the fast MP4 path.

import { progressModal }   from './progressModal.js'
import { canvasEngine }    from '../visualizer/canvasEngine.js'
import { exportSettings }  from './exportSettings.js'
import { showErrorDialog } from '../ui/errorDialog.js'
import { showConfirmDialog } from '../ui/confirmDialog.js'
import { isWeb }           from '../platform/webApi.js'

export const WEB_MAX_PIXELS = 1920 * 1080
export const WEB_MAX_FPS    = 30

const SILENCE_LEAD_MS = 120

let _webExporting = false

export function isWebExporting() {
  return _webExporting
}

export function pickRecorderMime() {
  if (typeof MediaRecorder === 'undefined') return ''
  const types = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ]
  return types.find(t => MediaRecorder.isTypeSupported(t)) || ''
}

export function capWebExport(es) {
  es.fps = Math.min(es.fps || 30, WEB_MAX_FPS)
  const pixels = (es.width || 1920) * (es.height || 1080)
  if (pixels > WEB_MAX_PIXELS) {
    const scale = Math.sqrt(WEB_MAX_PIXELS / pixels)
    es.width  = Math.max(2, Math.round((es.width  * scale) / 2) * 2)
    es.height = Math.max(2, Math.round((es.height * scale) / 2) * 2)
  }
}

function _sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function startWebExport() {
  const appState = window.appState
  if (!appState?.loaded || _webExporting) return false
  _webExporting = true
  try {
    return await _runWebExport(appState)
  } finally {
    _webExporting = false
  }
}

async function _runWebExport(appState) {

  if (document.visibilityState !== 'visible') {
    showErrorDialog(
      'Keep window in foreground',
      'Browser recording only works while this tab/window is visible. Bring SPulse to the foreground and try export again.',
    )
    return false
  }

  const mime = pickRecorderMime()
  if (!mime) {
    showErrorDialog(
      'Export not supported',
      'This browser cannot record canvas video. Try Chrome or Edge, or export a .spulse project and encode MP4 in the desktop app.',
    )
    return false
  }

  capWebExport(exportSettings)
  const { width: w, height: h, fps } = exportSettings
  const { audioLoader, analyser } = appState
  const duration = audioLoader.duration
  const totalFrames = Math.max(1, Math.ceil(duration * fps))

  if (duration >= 180) {
    const mins = Math.ceil(duration / 60)
    const ok = await showConfirmDialog({
      title: 'Long export time',
      message: `Browser export records in real time, so this export will take about ${mins} minute${mins === 1 ? '' : 's'}. Continue?`,
      confirmLabel: 'Continue export',
      cancelLabel: 'Cancel',
    })
    if (!ok) return false

    // Safety: when user explicitly continues, force-stop any residual preview
    // playback before entering recording mode.
    if (analyser.isPlaying) analyser.stop()
    canvasEngine.stop()
  }

  const btnExport = document.getElementById('btn-export')
  const btnPlay   = document.getElementById('btn-play-pause')
  if (btnExport) btnExport.disabled = true
  if (btnPlay)   btnPlay.disabled   = true

  let cancelled = false
  let cancelReason = ''
  let rec = null
  let dest = null
  let canvasStream = null
  const prevOnEnded = analyser.onEnded
  const chunks = []

  const cancelRecording = (reason = 'user') => {
    cancelled = true
    cancelReason = reason
    try { rec?.state === 'recording' && rec.stop() } catch { /* ignore */ }
    analyser.stop()
    canvasEngine.stop()
  }

  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden' && !cancelled) {
      cancelRecording('background')
    }
  }

  const cleanupGraph = () => {
    try { dest && analyser.analyserNode.disconnect(dest) } catch { /* already disconnected */ }
    try { analyser.analyserNode.connect(analyser.audioContext.destination) } catch { /* ignore */ }
    canvasStream?.getTracks().forEach(t => t.stop())
    analyser.onEnded = prevOnEnded
  }

  progressModal.init(() => {
    cancelRecording('user')
  })
  progressModal.show(totalFrames, {
    title: 'Recording video…',
    realtime: true,
  })

  document.addEventListener('visibilitychange', onVisibilityChange)

  try {
    if (analyser.isPlaying) analyser.stop()
    analyser.seek(0)
    analyser.setOutputMuted?.(true)
    if (analyser.audioContext.state === 'suspended') {
      await analyser.audioContext.resume()
    }

    canvasEngine.setExportResolution(w, h)
    canvasEngine.renderSyncFrame()
    await _sleep(SILENCE_LEAD_MS)

    const canvas = canvasEngine.r2d?.canvas
    if (!canvas) throw new Error('Canvas is not ready')

    canvasStream = canvas.captureStream(fps)
    dest = analyser.audioContext.createMediaStreamDestination()
    analyser.analyserNode.connect(dest)

    // Mute speakers during recording by disconnecting the speakers destination
    try { analyser.analyserNode.disconnect(analyser.audioContext.destination) } catch {}

    const tracks = [
      ...canvasStream.getVideoTracks(),
      ...dest.stream.getAudioTracks(),
    ]
    const mixed = new MediaStream(tracks)

    rec = new MediaRecorder(mixed, {
      mimeType: mime,
      videoBitsPerSecond: 6_000_000,
    })
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data) }

    const stopped = new Promise((resolve, reject) => {
      rec.onstop = resolve
      rec.onerror = ev => reject(ev.error || new Error('MediaRecorder failed'))
    })

    const ended = new Promise(resolve => {
      analyser.onEnded = resolve
    })

    rec.start(500)
    analyser.play()
    canvasEngine.start()

    const tick = setInterval(() => {
      const t = analyser.currentTime
      progressModal.update(Math.min(totalFrames, Math.floor(t * fps)), totalFrames)
    }, 250)

    await Promise.race([
      ended,
      new Promise(resolve => {
        const id = setInterval(() => {
          if (cancelled) { clearInterval(id); resolve() }
        }, 100)
      }),
    ])
    clearInterval(tick)

    if (rec.state === 'recording') rec.stop()
    analyser.stop()
    canvasEngine.stop()
    await stopped

    if (cancelled) {
      progressModal.hide()
      if (cancelReason === 'background') {
        showErrorDialog(
          'Recording interrupted',
          'Browser recording paused because SPulse was in the background. Keep this window visible during export and try again.',
        )
      }
      return true
    }

    const blob = new Blob(chunks, { type: mime.split(';')[0] })
    if (!blob.size) throw new Error('Recorder produced an empty file')

    const base = (appState.fileName || 'spulse').replace(/\.[^.]+$/, '')
    const filename = `${base}-spulse.webm`
    window.api.downloadBlob?.(blob, filename)
    progressModal.complete(filename)
    return true
  } catch (err) {
    progressModal.hide()
    showErrorDialog('Export Error', err.message || String(err))
    console.error('Web export error:', err)
    return true
  } finally {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    cleanupGraph()
    analyser.setOutputMuted?.(false)
    canvasEngine.clearExportData()
    canvasEngine.restorePreviewResolution()
    if (btnExport) btnExport.disabled = false
    if (btnPlay)   btnPlay.disabled   = false
  }
}

export function applyWebExportLimitsToDom() {
  if (!isWeb()) return
  capWebExport(exportSettings)

  const preset = document.getElementById('resolution-preset')
  if (preset) {
    [...preset.options].forEach(opt => {
      if (opt.value === 'custom') return
      const [w, h] = opt.value.split('x').map(Number)
      if (w && h && w * h > WEB_MAX_PIXELS) opt.remove()
    })
  }
  const fpsEl = document.getElementById('export-fps')
  if (fpsEl) {
    [...fpsEl.options].forEach(opt => {
      if (parseInt(opt.value, 10) > WEB_MAX_FPS) opt.remove()
    })
    fpsEl.value = String(Math.min(exportSettings.fps, WEB_MAX_FPS))
  }
}
