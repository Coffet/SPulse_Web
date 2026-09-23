// In-browser video export via MediaRecorder (WebM).
// Records the live canvas + decoded audio in real time — a 3-minute track
// takes about 3 minutes. Desktop FFmpeg remains the fast MP4 path.

import { progressModal }   from './progressModal.js'
import { CanvasEngine }    from '../visualizer/canvasEngine.js'
import { AudioAnalyser }   from '../audio/audioAnalyser.js'
import { exportSettings }  from './exportSettings.js'
import { showErrorDialog } from '../ui/errorDialog.js'
import { showConfirmDialog } from '../ui/confirmDialog.js'
import { isWeb }           from '../platform/webApi.js'
import { exportMissionManager } from './exportMissionManager.js'

export const WEB_MAX_PIXELS = 1920 * 1080
export const WEB_MAX_FPS    = 30

const SILENCE_LEAD_MS = 120

let _webExporting = false
let _sharedCanvas = null
let _sharedCanvasPromise = null
const exportCanvasEngine = new CanvasEngine({ exportOnly: true })

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

function _createExportAnalyser(audioLoader) {
  const context = new AudioContext()
  const sourceBuffer = audioLoader.audioBuffer
  const buffer = context.createBuffer(
    sourceBuffer.numberOfChannels,
    sourceBuffer.length,
    sourceBuffer.sampleRate,
  )

  for (let channel = 0; channel < sourceBuffer.numberOfChannels; channel++) {
    buffer.copyToChannel(sourceBuffer.getChannelData(channel), channel)
  }

  const analyser = new AudioAnalyser(context)
  analyser.setBuffer(buffer)
  analyser.setOutputMuted(true)
  return { analyser, context }
}

async function _acquireCanvasStream(w, h, fps, exportAnalyser) {
  if (_sharedCanvas) {
    _sharedCanvas.users++
    return { stream: _sharedCanvas.stream, release: _releaseCanvasStream }
  }

  if (_sharedCanvasPromise) {
    await _sharedCanvasPromise
    return _acquireCanvasStream(w, h, fps, exportAnalyser)
  }

  let resolveReady
  let rejectReady
  _sharedCanvasPromise = new Promise((resolve, reject) => {
    resolveReady = resolve
    rejectReady = reject
  })

  try {
    const exportCanvas = document.createElement('canvas')
    exportCanvasEngine.initExport(window.appState, exportCanvas)
    exportCanvasEngine.setExportResolution(w, h)
    exportCanvasEngine.setExportAnalyser(exportAnalyser)
    exportCanvasEngine.renderSyncFrame()
    await _sleep(SILENCE_LEAD_MS)

    const canvas = exportCanvasEngine.r2d?.canvas
    if (!canvas) throw new Error('Canvas is not ready')

    _sharedCanvas = {
      stream: canvas.captureStream(fps),
      users: 1,
    }
    resolveReady()
    return { stream: _sharedCanvas.stream, release: _releaseCanvasStream }
  } catch (error) {
    rejectReady(error)
    throw error
  } finally {
    _sharedCanvasPromise = null
  }
}

function _releaseCanvasStream() {
  if (!_sharedCanvas) return
  _sharedCanvas.users--
  if (_sharedCanvas.users > 0) return

  _sharedCanvas.stream.getTracks().forEach(track => track.stop())
  _sharedCanvas = null
  exportCanvasEngine.stop()
  exportCanvasEngine.setExportAnalyser(null)
  exportCanvasEngine.clearExportData()
  exportCanvasEngine.restorePreviewResolution()
}

export async function startWebExport() {
  const appState = window.appState
  if (!appState?.loaded) return false

  if (_webExporting) {
    const settings = { ...exportSettings }
    const duration = appState.audioLoader?.duration || 0
    const totalFrames = Math.max(1, Math.ceil(duration * (settings.fps || 30)))
    const filename = `${(appState.fileName || 'spulse').replace(/\.[^.]+$/, '')}-spulse.webm`
    _runWebExport(appState, settings).finally(() => {
      if (!exportMissionManager.hasActiveOrQueued()) _webExporting = false
    })
    return true
  }

  _webExporting = true
  try {
    return await _runWebExport(appState)
  } finally {
    if (!exportMissionManager.hasActiveOrQueued()) _webExporting = false
  }
}

async function _runWebExport(appState, settingsSnapshot = null, existingTask = null) {

  if (document.visibilityState !== 'visible') {
    if (existingTask) exportMissionManager.cancelTask(existingTask.id)
    showErrorDialog(
      'Keep window in foreground',
      'Browser recording only works while this tab/window is visible. Bring SPulse to the foreground and try export again.',
    )
    return false
  }

  const mime = pickRecorderMime()
  if (!mime) {
    if (existingTask) exportMissionManager.cancelTask(existingTask.id)
    showErrorDialog(
      'Export not supported',
      'This browser cannot record canvas video. Try Chrome or Edge, or export a .spulse project and encode MP4 in the desktop app.',
    )
    return false
  }

  const settings = settingsSnapshot || exportSettings
  capWebExport(settings)
  const { width: w, height: h, fps } = settings
  const { audioLoader } = appState
  const { analyser: exportAnalyser, context: exportAudioContext } = _createExportAnalyser(audioLoader)
  const duration = audioLoader.duration
  const totalFrames = Math.max(1, Math.ceil(duration * fps))

  if (duration >= 180) {
    const mins = Math.ceil(duration / 60)
    const ok = await showConfirmDialog({
      title: 'Long export time',
      message: `Browser export records in real time, so this export will take about ${mins} minute${mins === 1 ? '' : 's'}. Continue?`,
      confirmLabel: 'Continue',
      cancelLabel: 'Cancel',
    })
    if (!ok) {
      exportAudioContext.close().catch(() => {})
      if (existingTask) exportMissionManager.cancelTask(existingTask.id)
      return false
    }
  }

  const btnExport = document.getElementById('btn-export')

  let cancelled = false
  let cancelReason = ''
  let rec = null
  let dest = null
  let canvasStream = null
  let releaseCanvas = null
  const chunks = []
  const missionTask = existingTask || exportMissionManager.registerTask({
    title: `${appState.fileName || 'Visualizer'} export`,
    filename: `${(appState.fileName || 'spulse').replace(/\.[^.]+$/, '')}-spulse.webm`,
    totalFrames,
  })
  let pausedAt = 0
  let paused = false

  const pauseRecording = () => {
    if (cancelled || paused || !rec || rec.state !== 'recording') return
    paused = true
    pausedAt = exportAnalyser.currentTime
    try { rec.pause() } catch { return }
    exportAnalyser.pause()
  }

  const resumeRecording = () => {
    if (cancelled || !paused || !rec || rec.state !== 'paused') return
    paused = false
    try { rec.resume() } catch { return }
    exportAnalyser.seek(pausedAt)
    exportAnalyser.play()
  }

  const cancelRecording = (reason = 'user') => {
    cancelled = true
    cancelReason = reason
    try { rec?.state === 'recording' && rec.stop() } catch { /* ignore */ }
    exportAnalyser.stop()
  }

  exportMissionManager.setTaskController(missionTask.id, {
    pause: pauseRecording,
    resume: resumeRecording,
    cancel: () => cancelRecording('user'),
  })

  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden' && !cancelled) {
      cancelRecording('background')
    }
  }

  const cleanupGraph = () => {
    try { dest && exportAnalyser.analyserNode.disconnect(dest) } catch { /* already disconnected */ }
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
    exportAnalyser.seek(0)
    if (exportAnalyser.audioContext.state === 'suspended') {
      await exportAnalyser.audioContext.resume()
    }

    const canvasLease = await _acquireCanvasStream(w, h, fps, exportAnalyser)
    canvasStream = canvasLease.stream
    releaseCanvas = canvasLease.release
    dest = exportAnalyser.audioContext.createMediaStreamDestination()
    exportAnalyser.analyserNode.connect(dest)

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
      exportAnalyser.onEnded = resolve
    })

    rec.start(500)
    exportAnalyser.play()
    if (_sharedCanvas?.users === 1) exportCanvasEngine.start()

    const tick = setInterval(() => {
      const t = exportAnalyser.currentTime
      const progress = progressModal.update(Math.min(totalFrames, Math.floor(t * fps)), totalFrames)
      exportMissionManager.updateProgress(missionTask.id, {
        framesDone: Math.min(totalFrames, Math.floor(t * fps)),
        totalFrames,
        etaText: progress.etaText || (paused ? 'Paused' : 'Recording…'),
        rateFps: progress.rate,
      })
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
    exportAnalyser.stop()
    await stopped

    if (cancelled) {
      exportMissionManager.cancelTask(missionTask.id)
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
    exportMissionManager.completeTask(missionTask.id, { filename, blob })
    return true
  } catch (err) {
    exportMissionManager.cancelTask(missionTask.id)
    progressModal.hide()
    showErrorDialog('Export Error', err.message || String(err))
    console.error('Web export error:', err)
    return true
  } finally {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    cleanupGraph()
    exportAnalyser.stop()
    exportAnalyser.onEnded = null
    exportAudioContext.close().catch(() => {})
    releaseCanvas?.()
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
