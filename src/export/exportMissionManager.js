// Export Mission Manager — provides a persistent top bar Mission icon
// with circular progress and an Export Process dropdown menu.
// Enables multi-export queueing, pausing, resuming, cancelling,
// and minimizing / replacing the export progress modal.
// Scope: Web platform.

import { isWeb } from '../platform/webApi.js'
import { progressModal } from './progressModal.js'

const CIRCUMFERENCE = 87.964 // 2 * PI * 14
const STORAGE_KEY_AUTO_MINIMIZE = 'spulse_export_auto_minimize'

// Task-card action icons, drawn at 11px by .icon-xs. Same stroke weight and
// rounded caps as the rest of the studio icons.
const ICON = {
  pause:  '<svg viewBox="0 0 16 16" fill="currentColor" class="icon-xs" aria-hidden="true"><rect x="3" y="2" width="3" height="12" rx="1"/><rect x="10" y="2" width="3" height="12" rx="1"/></svg>',
  resume: '<svg viewBox="0 0 16 16" fill="currentColor" class="icon-xs" aria-hidden="true"><path d="M4 2v12l10-6z"/></svg>',
  stop:   '<svg viewBox="0 0 16 16" fill="currentColor" class="icon-xs" aria-hidden="true"><rect x="4.5" y="4.5" width="7" height="7" rx="1.5"/></svg>',
  close:  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" class="icon-xs" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/></svg>',
}

class ExportMissionManager {
  constructor() {
    this.tasks = []
    this.activeTaskId = null
    this._isMenuOpen = false
    this._autoMinimize = false
    this._isModalMinimized = false
    this._domInitialized = false
  }

  init() {
    if (this._domInitialized) return
    this._domInitialized = true

    if (isWeb()) {
      localStorage.removeItem(STORAGE_KEY_AUTO_MINIMIZE)
      this._autoMinimize = true
    } else {
      const savedAutoMinimize = localStorage.getItem(STORAGE_KEY_AUTO_MINIMIZE)
      this._autoMinimize = savedAutoMinimize === 'true'
    }

    this._wrapEl      = document.getElementById('studio-mission-wrap')
    this._btnIconEl   = document.getElementById('btn-mission-icon')
    this._circleFgEl  = document.getElementById('mission-circle-fg')
    this._activeGlyph = document.getElementById('mission-active-glyph')
    this._pausedGlyph = document.getElementById('mission-paused-glyph')
    this._doneGlyph   = document.getElementById('mission-complete-glyph')
    this._countBadge  = document.getElementById('mission-count-badge')
    this._menuEl      = document.getElementById('export-process-menu')
    this._listEl      = document.getElementById('mission-task-list')
    this._badgeEl     = document.getElementById('export-menu-status-badge')
    this._clearBtn    = document.getElementById('mission-clear-btn')
    this._closeMenuBtn= document.getElementById('mission-close-menu-btn')
    // The "Minimize dialog by default" control is commented out in index.html
    // (there is no export dialog left to minimize), so `_optMinimize` is null
    // and the bindings below stay inert. `_autoMinimize` is retained only so
    // the stored preference survives if the control returns.
    this._optMinimize = document.getElementById('mission-opt-auto-minimize')

    if (isWeb()) this._optMinimize?.closest('.export-menu-opt')?.classList.add('hidden')

    if (this._optMinimize) {
      this._optMinimize.checked = this._autoMinimize
      this._optMinimize.addEventListener('change', e => {
        this._autoMinimize = !!e.target.checked
        try {
          localStorage.setItem(STORAGE_KEY_AUTO_MINIMIZE, String(this._autoMinimize))
        } catch { /* storage disabled */ }
      })
    }

    if (this._btnIconEl) {
      this._btnIconEl.addEventListener('click', e => {
        e.stopPropagation()
        this.toggleMenu()
      })
    }

    if (this._closeMenuBtn) {
      this._closeMenuBtn.addEventListener('click', e => {
        e.stopPropagation()
        this.closeMenu()
      })
    }

    if (this._clearBtn) {
      this._clearBtn.addEventListener('click', e => {
        e.stopPropagation()
        this.clearFinished()
      })
    }

    // Close menu when clicking outside
    document.addEventListener('click', e => {
      if (!this._isMenuOpen) return
      if (this._menuEl && !this._menuEl.contains(e.target) && !this._btnIconEl.contains(e.target)) {
        this.closeMenu()
      }
    })

    // Keyboard ESC to close menu
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && this._isMenuOpen) {
        this.closeMenu()
      }
    })

    // Delegated actions inside task list
    if (this._listEl) {
      this._listEl.addEventListener('click', e => {
        const btn = e.target.closest('[data-action]')
        if (!btn) return
        e.stopPropagation()
        const action = btn.dataset.action
        const taskId = btn.dataset.taskId
        if (!taskId) return

        switch (action) {
          case 'pause':
            this.pauseTask(taskId)
            break
          case 'resume':
            this.resumeTask(taskId)
            break
          case 'cancel':
            this.cancelTask(taskId)
            break
          // 'dialog' action removed — it called progressModal.restore() to
          // re-open `#export-modal`, which is commented out in index.html.
          // case 'dialog':
          //   progressModal.restore()
          //   this.closeMenu()
          //   break
          // 'download' action removed — the web export auto-downloads the file
          // on completion, so there is nothing to re-save from the menu.
          case 'dismiss':
            this.dismissTask(taskId)
            break
        }
      })
    }

    this._syncTopBarIcon()
  }

  isAutoMinimizeEnabled() {
    return this._autoMinimize
  }

  setAutoMinimize(enabled) {
    this._autoMinimize = !!enabled
    if (this._optMinimize) this._optMinimize.checked = this._autoMinimize
    try {
      localStorage.setItem(STORAGE_KEY_AUTO_MINIMIZE, String(this._autoMinimize))
    } catch {}
  }

  isModalMinimized() {
    return this._isModalMinimized
  }

  setModalMinimized(minimized) {
    this._isModalMinimized = !!minimized
  }

  toggleMenu() {
    if (this._isMenuOpen) {
      this.closeMenu()
    } else {
      this.openMenu()
    }
  }

  openMenu() {
    this._isMenuOpen = true
    this._menuEl?.classList.remove('hidden')
    this._btnIconEl?.setAttribute('aria-expanded', 'true')
    this._btnIconEl?.classList.add('is-active')
    this._renderTaskList()
  }

  closeMenu() {
    this._isMenuOpen = false
    this._menuEl?.classList.add('hidden')
    this._btnIconEl?.setAttribute('aria-expanded', 'false')
    this._btnIconEl?.classList.remove('is-active')
  }

  // ─── Task Registration & Queueing ──────────────────────────────────────────

  registerTask({ id, title, filename, totalFrames, controller, startFn }) {
    this.init()

    const status = 'recording'

    const task = {
      id: id || `exp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: title || filename || 'Visualizer Video',
      filename: filename || 'spulse.webm',
      totalFrames: totalFrames || 0,
      framesDone: 0,
      progress: 0,
      status, // 'recording' | 'paused' | 'queued' | 'completed' | 'cancelled' | 'error'
      etaText: status === 'queued' ? 'Queued' : 'Preparing…',
      rateFps: null,
      controller: controller || {},
      startFn: startFn || null,
      createdAt: Date.now(),
    }

    this.tasks.push(task)
    if (status === 'recording') {
      this.activeTaskId = task.id
    }

    // Reveal top bar Mission icon
    this._wrapEl?.classList.remove('hidden')
    this._syncTopBarIcon()
    this._renderTaskList()

    return task
  }

  setTaskController(taskId, controller) {
    const task = this.tasks.find(t => t.id === taskId)
    if (task) {
      task.controller = controller
    }
  }

  updateProgress(taskId, { framesDone, totalFrames, etaText, rateFps }) {
    const task = this.tasks.find(t => t.id === taskId)
    if (!task) return

    if (totalFrames !== undefined) task.totalFrames = totalFrames
    if (framesDone !== undefined) task.framesDone = framesDone
    task.progress = task.totalFrames > 0 ? Math.min(1, task.framesDone / task.totalFrames) : 0
    if (etaText !== undefined) task.etaText = etaText
    if (rateFps !== undefined) task.rateFps = rateFps

    this._syncTopBarIcon()
    if (this._isMenuOpen) {
      this._updateTaskDom(task)
    }
  }

  pauseTask(taskId) {
    const task = this.tasks.find(t => t.id === taskId)
    if (!task || task.status !== 'recording') return
    task.status = 'paused'
    task.controller?.pause?.()
    this._syncTopBarIcon()
    this._renderTaskList()
    progressModal.setMessage('Export paused')
  }

  resumeTask(taskId) {
    const task = this.tasks.find(t => t.id === taskId)
    if (!task || task.status !== 'paused') return
    task.status = 'recording'
    task.controller?.resume?.()
    this._syncTopBarIcon()
    this._renderTaskList()
    progressModal.setMessage('Exporting…')
  }

  cancelTask(taskId) {
    const task = this.tasks.find(t => t.id === taskId)
    if (!task) return

    const wasActive = (task.id === this.activeTaskId)
    task.controller?.cancel?.()
    task.status = 'cancelled'

    // Remove task or mark cancelled
    this.tasks = this.tasks.filter(t => t.id !== taskId)

    if (wasActive) {
      this.activeTaskId = null
      progressModal.hide()
      // Check if there is a queued task ready to run
      this._runNextQueued()
    }

    if (!this.hasActiveOrQueued()) {
      // Prompt requirement: "cancelling also removes the icon"
      this._wrapEl?.classList.add('hidden')
      this.closeMenu()
    } else {
      this._syncTopBarIcon()
      this._renderTaskList()
    }
  }

  // `filename` only — the file itself is not retained. The web export triggers
  // the browser download as soon as recording stops, so holding a finished
  // video Blob here would just pin hundreds of MB for the rest of the session.
  completeTask(taskId, { filename } = {}) {
    const task = this.tasks.find(t => t.id === taskId)
    if (!task) return

    task.status = 'completed'
    task.progress = 1
    task.framesDone = task.totalFrames
    task.etaText = 'Completed ✓'
    if (filename) task.filename = filename

    if (this.activeTaskId === taskId) {
      this.activeTaskId = null
      this._runNextQueued()
    }

    this._syncTopBarIcon()
    this._renderTaskList()
  }

  dismissTask(taskId) {
    this.tasks = this.tasks.filter(t => t.id !== taskId)
    if (!this.hasActiveOrQueued() && this.tasks.length === 0) {
      this._wrapEl?.classList.add('hidden')
      this.closeMenu()
    } else {
      this._syncTopBarIcon()
      this._renderTaskList()
    }
  }

  clearFinished() {
    this.tasks = this.tasks.filter(t => t.status === 'recording' || t.status === 'paused' || t.status === 'queued')
    if (!this.hasActiveOrQueued()) {
      this._wrapEl?.classList.add('hidden')
      this.closeMenu()
    } else {
      this._syncTopBarIcon()
      this._renderTaskList()
    }
  }

  hasActiveOrQueued() {
    return this.tasks.some(t => t.status === 'recording' || t.status === 'paused' || t.status === 'queued')
  }

  getActiveTask() {
    return this.tasks.find(t => t.id === this.activeTaskId)
      || this.tasks.find(t => t.status === 'recording' || t.status === 'paused')
      || null
  }

  _runNextQueued() {
    const next = this.tasks.find(t => t.status === 'queued')
    if (!next) return
    next.status = 'recording'
    this.activeTaskId = next.id
    this._syncTopBarIcon()
    this._renderTaskList()
    if (typeof next.startFn === 'function') next.startFn()
  }

  // ─── Top Bar Icon Sync ──────────────────────────────────────────────────────

  _syncTopBarIcon() {
    if (!this._btnIconEl) return

    const activeOrPaused = this.getActiveTask()
    const activeTasks = this.tasks.filter(t => t.status === 'recording' || t.status === 'paused')
    const queuedTasks = this.tasks.filter(t => t.status === 'queued')
    const totalPending = activeTasks.length + queuedTasks.length

    // If completely empty or all cancelled, hide icon
    if (this.tasks.length === 0 || totalPending === 0) {
      const anyCompleted = this.tasks.some(t => t.status === 'completed')
      if (!anyCompleted) {
        this._wrapEl?.classList.add('hidden')
        return
      }
    }

    this._wrapEl?.classList.remove('hidden')

    // Count badge (if multi export)
    if (this._countBadge) {
      if (totalPending > 1) {
        this._countBadge.textContent = String(totalPending)
        this._countBadge.classList.remove('hidden')
      } else {
        this._countBadge.classList.add('hidden')
      }
    }

    // Circular progress
    const progress = activeOrPaused ? activeOrPaused.progress : (this.tasks.length > 0 ? 1 : 0)
    const offset = Math.max(0, Math.min(CIRCUMFERENCE, CIRCUMFERENCE * (1 - progress)))
    if (this._circleFgEl) {
      this._circleFgEl.style.strokeDashoffset = `${offset}`
    }

    // Glyphs and states
    const isPaused = activeOrPaused?.status === 'paused'
    const isCompleted = !activeOrPaused && this.tasks.some(t => t.status === 'completed')

    this._btnIconEl.classList.toggle('is-paused', isPaused)
    this._btnIconEl.classList.toggle('is-completed', isCompleted && !activeOrPaused)

    if (isPaused) {
      this._activeGlyph?.classList.add('hidden')
      this._pausedGlyph?.classList.remove('hidden')
      this._doneGlyph?.classList.add('hidden')
      this._btnIconEl.title = `Export Process: Paused (${Math.round(progress * 100)}%)`
    } else if (isCompleted && !activeOrPaused) {
      this._activeGlyph?.classList.add('hidden')
      this._pausedGlyph?.classList.add('hidden')
      this._doneGlyph?.classList.remove('hidden')
      this._btnIconEl.title = 'Export Process: Completed'
    } else {
      this._activeGlyph?.classList.remove('hidden')
      this._pausedGlyph?.classList.add('hidden')
      this._doneGlyph?.classList.add('hidden')
      const pct = Math.round(progress * 100)
      this._btnIconEl.title = `Export Process: ${pct}%`
    }
  }

  // ─── Dropdown Menu Rendering ────────────────────────────────────────────────

  // Text for the card badge — the *only* place a task's status is stated.
  // "Exporting" rather than "Recording": it describes both the web
  // MediaRecorder path and the desktop FFmpeg frame render. The internal
  // status value stays 'recording' (it is the MediaRecorder state).
  _statusLabel(task) {
    const pct = Math.round((task.progress || 0) * 100)
    switch (task.status) {
      case 'recording': return `Exporting ${pct}%`
      case 'paused':    return `Paused ${pct}%`
      case 'queued':    return 'Queued'
      case 'completed': return 'Done'
      case 'cancelled': return 'Cancelled'
      default:          return ''
    }
  }

  // Secondary line under the filename. Deliberately never repeats the badge:
  // it carries an ETA / frame rate, or explains why a task is not running.
  _metaText(task) {
    if (task.status === 'completed' || task.status === 'cancelled') return ''
    if (task.status === 'queued') return 'Starts when the current export finishes'
    const raw = String(task.etaText || '').trim()
    // Drop bare status restatements: 'Exporting…', 'Paused', 'Paused (67%)'.
    const bareStatus = /^(exporting|recording|paused|queued|completed|cancelled)\b\s*(\(\d+%\))?\s*[✓…]*$/i
    return bareStatus.test(raw) ? '' : raw
  }

  _renderTaskList() {
    if (!this._listEl) return

    // Update status badge in header
    if (this._badgeEl) {
      const activeCount = this.tasks.filter(t => t.status === 'recording').length
      const pausedCount = this.tasks.filter(t => t.status === 'paused').length
      const queuedCount = this.tasks.filter(t => t.status === 'queued').length

      if (activeCount > 0) {
        this._badgeEl.textContent = `${activeCount} active`
        this._badgeEl.className = 'export-menu-status-badge badge-active'
      } else if (pausedCount > 0) {
        this._badgeEl.textContent = 'Paused'
        this._badgeEl.className = 'export-menu-status-badge badge-paused'
      } else if (queuedCount > 0) {
        this._badgeEl.textContent = `${queuedCount} queued`
        this._badgeEl.className = 'export-menu-status-badge badge-queued'
      } else if (this.tasks.length > 0) {
        this._badgeEl.textContent = 'Done'
        this._badgeEl.className = 'export-menu-status-badge badge-done'
      } else {
        this._badgeEl.textContent = 'Idle'
        this._badgeEl.className = 'export-menu-status-badge'
      }
    }

    // "Clear" only does something once a task has finished, so say that.
    if (this._clearBtn) {
      const hasFinished = this.tasks.some(t => t.status === 'completed' || t.status === 'cancelled')
      this._clearBtn.disabled = !hasFinished
      this._clearBtn.title = hasFinished ? 'Clear finished exports' : 'Nothing finished yet'
    }

    if (this.tasks.length === 0) {
      this._listEl.innerHTML = `
        <div class="mission-empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 4v11M7 10l5 5 5-5"/><path d="M4 19h16"/>
          </svg>
          <p class="mission-empty-title">No exports yet</p>
          <p class="mission-empty-sub">Exports you start will appear here.</p>
        </div>
      `
      return
    }

    this._listEl.innerHTML = this.tasks.map(task => this._taskCardHtml(task)).join('')
  }

  _taskCardHtml(task) {
    const pct = Math.round((task.progress || 0) * 100)
    const statusLabel = this._statusLabel(task)
    const metaText    = this._metaText(task)
    const statusClass = `status-${task.status}`
    let actionsHtml = ''

    // NOTE: the old "Details" button (data-action="dialog") has been removed.
    // It only called progressModal.restore() to re-open `#export-modal`, which
    // is commented out in index.html — the Export Process menu is the only
    // export UI now, so there is no dialog to restore. Reference markup, kept
    // in case the dialog is ever uncommented:
    //
    //   <button type="button" class="btn-xs btn-mission-dialog"
    //           data-action="dialog" data-task-id="${task.id}"
    //           title="Show progress dialog">Details</button>

    if (task.status === 'recording') {
      actionsHtml = `
        <button type="button" class="btn-xs btn-mission-pause" data-action="pause" data-task-id="${task.id}" title="Pause export">
          ${ICON.pause}
          Pause
        </button>
        <button type="button" class="btn-xs btn-mission-cancel" data-action="cancel" data-task-id="${task.id}" title="Cancel export">
          ${ICON.stop}
          Cancel
        </button>
      `
    } else if (task.status === 'paused') {
      actionsHtml = `
        <button type="button" class="btn-xs btn-mission-resume" data-action="resume" data-task-id="${task.id}" title="Resume export">
          ${ICON.resume}
          Resume
        </button>
        <button type="button" class="btn-xs btn-mission-cancel" data-action="cancel" data-task-id="${task.id}" title="Cancel export">
          ${ICON.stop}
          Cancel
        </button>
      `
    } else if (task.status === 'queued') {
      actionsHtml = `
        <button type="button" class="btn-xs btn-mission-cancel" data-action="cancel" data-task-id="${task.id}" title="Remove from queue">
          ${ICON.stop}
          Cancel
        </button>
      `
    } else if (task.status === 'completed') {
      // No "save again" button: the web export hands the file to the browser
      // the moment it finishes (see webRecorder.js), so re-downloading would
      // duplicate an action the user has already had happen.
      actionsHtml = `
        <button type="button" class="btn-xs btn-mission-dismiss" data-action="dismiss" data-task-id="${task.id}" title="Remove from list">
          ${ICON.close}
          Dismiss
        </button>
      `
    } else if (task.status === 'cancelled') {
      actionsHtml = `
        <button type="button" class="btn-xs btn-mission-dismiss" data-action="dismiss" data-task-id="${task.id}" title="Remove from list">
          ${ICON.close}
          Dismiss
        </button>
      `
    }

    return `
      <div class="mission-item ${statusClass}" id="mission-item-${task.id}">
        <div class="mission-item-header">
          <span class="mission-item-title" title="${this._escape(task.filename || task.title)}">
            ${this._escape(task.filename || task.title)}
          </span>
          <span class="mission-item-badge ${statusClass}">${statusLabel}</span>
        </div>

        <div class="mission-item-progress-track">
          <div class="mission-item-progress-fill" style="width: ${pct}%"></div>
        </div>

        <div class="mission-item-meta">
          <span class="mission-meta-info">${this._escape(metaText)}</span>
          <div class="mission-item-actions">
            ${actionsHtml}
          </div>
        </div>
      </div>
    `
  }

  _updateTaskDom(task) {
    const el = document.getElementById(`mission-item-${task.id}`)
    if (!el) {
      this._renderTaskList()
      return
    }
    const pct = Math.round((task.progress || 0) * 100)
    const fill = el.querySelector('.mission-item-progress-fill')
    if (fill) fill.style.width = `${pct}%`
    const badge = el.querySelector('.mission-item-badge')
    if (badge && task.status === 'recording') badge.textContent = this._statusLabel(task)
    const meta = el.querySelector('.mission-meta-info')
    if (meta) meta.textContent = this._metaText(task)
  }

  _escape(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }
}

export const exportMissionManager = new ExportMissionManager()
