/**
 * DZ Agent V5 — Execution Monitor & Logger
 * Tracks task execution, step timing, agent activity, and system health.
 */

export class ExecutionMonitor {
  constructor() {
    this.activeTasks = new Map()    // taskId → task metadata
    this.completedTasks = []        // ring buffer of completed tasks
    this.systemEvents = []          // global event log
    this.MAX_COMPLETED = 100
    this.MAX_EVENTS = 500
  }

  // ── Task lifecycle ─────────────────────────────────────────────────────
  taskStart(taskId, goal) {
    this.activeTasks.set(taskId, {
      taskId,
      goal,
      startedAt: Date.now(),
      steps: new Map(),
      events: [],
      status: 'running',
    })
    this._logEvent('task_start', { taskId, goal })
  }

  taskDone(taskId, result) {
    const task = this.activeTasks.get(taskId)
    if (task) {
      task.status = 'done'
      task.completedAt = Date.now()
      task.duration = task.completedAt - task.startedAt
      task.resultPreview = JSON.stringify(result?.summary || result?.output || result).slice(0, 200)
      this.activeTasks.delete(taskId)
      this.completedTasks.unshift({ ...task, steps: Object.fromEntries(task.steps) })
      if (this.completedTasks.length > this.MAX_COMPLETED) this.completedTasks.pop()
    }
    this._logEvent('task_done', { taskId })
  }

  taskFail(taskId, error) {
    const task = this.activeTasks.get(taskId)
    if (task) {
      task.status = 'failed'
      task.error = error
      task.completedAt = Date.now()
      this.activeTasks.delete(taskId)
      this.completedTasks.unshift({ ...task, steps: Object.fromEntries(task.steps) })
      if (this.completedTasks.length > this.MAX_COMPLETED) this.completedTasks.pop()
    }
    this._logEvent('task_fail', { taskId, error })
  }

  // ── Step lifecycle ─────────────────────────────────────────────────────
  stepStart(taskId, stepId, description) {
    const task = this.activeTasks.get(taskId)
    if (task) {
      task.steps.set(stepId, { stepId, description, startedAt: Date.now(), status: 'running' })
      task.events.push({ type: 'step_start', stepId, description, ts: Date.now() })
    }
  }

  stepDone(taskId, stepId, result) {
    const task = this.activeTasks.get(taskId)
    if (task) {
      const step = task.steps.get(stepId)
      if (step) {
        step.status = 'done'
        step.completedAt = Date.now()
        step.duration = step.completedAt - step.startedAt
        step.resultPreview = JSON.stringify(result?.output || result).slice(0, 100)
      }
      task.events.push({ type: 'step_done', stepId, ts: Date.now() })
    }
  }

  stepFail(taskId, stepId, error) {
    const task = this.activeTasks.get(taskId)
    if (task) {
      const step = task.steps.get(stepId)
      if (step) {
        step.status = 'failed'
        step.error = error
        step.completedAt = Date.now()
      }
      task.events.push({ type: 'step_fail', stepId, error, ts: Date.now() })
    }
  }

  // ── Stats & reporting ──────────────────────────────────────────────────
  getActiveTask(taskId) {
    const task = this.activeTasks.get(taskId)
    if (!task) return null
    return {
      ...task,
      steps: Object.fromEntries(task.steps),
      elapsed: Date.now() - task.startedAt,
    }
  }

  getTaskEvents(taskId) {
    const task = this.activeTasks.get(taskId)
    return task?.events || []
  }

  stats() {
    return {
      activeTasks: this.activeTasks.size,
      completedTasks: this.completedTasks.length,
      recentCompleted: this.completedTasks.slice(0, 5).map(t => ({
        taskId: t.taskId,
        goal: t.goal?.slice(0, 60),
        status: t.status,
        duration: t.duration,
      })),
      activeTaskList: [...this.activeTasks.values()].map(t => ({
        taskId: t.taskId,
        goal: t.goal?.slice(0, 60),
        elapsed: Date.now() - t.startedAt,
        steps: t.steps.size,
      })),
    }
  }

  _logEvent(type, data) {
    this.systemEvents.unshift({ type, ...data, ts: Date.now() })
    if (this.systemEvents.length > this.MAX_EVENTS) this.systemEvents.pop()
  }
}

let _instance = null
export function getMonitor() {
  if (!_instance) _instance = new ExecutionMonitor()
  return _instance
}
