// DZ Agent V3 — Agent message bus.
// In-process pub/sub used by agents to coordinate within a single task run.
// Each task gets its own Bus instance (created by TaskManager).

export class AgentBus {
  constructor(taskId) {
    this.taskId = taskId
    this.events = []           // chronological log
    this.subscribers = new Set()
  }

  emit(kind, payload = {}) {
    const evt = {
      taskId: this.taskId,
      kind,                    // 'agent.start' | 'agent.thought' | 'agent.tool' | 'agent.result' | 'agent.error' | 'task.done' | 'task.error'
      ts: Date.now(),
      ...payload,
    }
    this.events.push(evt)
    for (const fn of this.subscribers) {
      try { fn(evt) } catch {}
    }
    return evt
  }

  subscribe(fn) {
    this.subscribers.add(fn)
    return () => this.subscribers.delete(fn)
  }

  history() { return this.events.slice() }
}
