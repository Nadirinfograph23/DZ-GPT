/**
 * DZ Agent V5 — Tool Registry
 * Central registry for all available tools with permissions and rate limiting.
 */

import { WebSearchTool } from './web-search.js'
import { CodeExecTool } from './code-exec.js'
import { BrowserTool } from './browser.js'
import { GitHubTool } from './github.js'
import { FileSystemTool } from './file-system.js'

export const TOOL_PERMISSIONS = {
  web_search:    { level: 'public',    rateLimit: 30, timeout: 15000 },
  browser:       { level: 'public',    rateLimit: 20, timeout: 20000 },
  code_exec:     { level: 'sandbox',   rateLimit: 10, timeout: 30000 },
  github:        { level: 'token',     rateLimit: 60, timeout: 15000 },
  file_read:     { level: 'workspace', rateLimit: 100, timeout: 5000 },
  file_write:    { level: 'workspace', rateLimit: 50,  timeout: 5000 },
  ai_think:      { level: 'public',   rateLimit: 50, timeout: 45000 },
  memory_search: { level: 'internal', rateLimit: 100, timeout: 2000 },
  youtube_search:{ level: 'public',   rateLimit: 20, timeout: 15000 },
}

export class ToolRegistry {
  constructor({ memory, workspaceManager }) {
    this._tools = {}
    this._callCounts = new Map()
    this._memory = memory
    this._workspace = workspaceManager
    this._registerAll()
  }

  _registerAll() {
    this.register('web_search',    new WebSearchTool())
    this.register('browser',       new BrowserTool())
    this.register('code_exec',     new CodeExecTool())
    this.register('github',        new GitHubTool())
    this.register('file_read',     new FileSystemTool('read'))
    this.register('file_write',    new FileSystemTool('write'))
    this.register('ai_think',      { execute: async (input, ctx) => ({ output: null, _defer: true }) })
    this.register('memory_search', {
      execute: async (input) => {
        const results = this._memory.searchLongTerm(input.query || input, 5)
        return { output: results, count: results.length }
      },
    })
    this.register('youtube_search', {
      execute: async (input) => {
        try {
          const q = encodeURIComponent(input.query || input)
          const res = await fetch(`https://www.youtube.com/results?search_query=${q}`)
          const html = await res.text()
          const matches = [...html.matchAll(/"title":\{"runs":\[\{"text":"([^"]+)"\}\]/g)].slice(0, 5)
          const ids = [...html.matchAll(/\/watch\?v=([\w-]{11})/g)].map(m => m[1]).filter((v, i, a) => a.indexOf(v) === i).slice(0, 5)
          return {
            output: ids.map((id, i) => ({
              title: matches[i]?.[1] || `Video ${i + 1}`,
              url: `https://www.youtube.com/watch?v=${id}`,
              videoId: id,
            })),
          }
        } catch (err) {
          return { error: err.message }
        }
      },
    })
  }

  register(name, tool) {
    this._tools[name] = tool
    this._callCounts.set(name, [])
  }

  get(name) { return this._tools[name] || null }

  list() {
    return Object.keys(this._tools).map(name => ({
      name,
      permissions: TOOL_PERMISSIONS[name] || {},
      available: !!this._tools[name],
    }))
  }

  async call(toolName, input, context = {}) {
    const tool = this._tools[toolName]
    if (!tool) return { error: `Unknown tool: ${toolName}` }

    const perm = TOOL_PERMISSIONS[toolName] || {}

    // Rate limit check
    const calls = this._callCounts.get(toolName) || []
    const oneMinAgo = Date.now() - 60000
    const recentCalls = calls.filter(t => t > oneMinAgo)
    if (perm.rateLimit && recentCalls.length >= perm.rateLimit) {
      return { error: `Rate limit exceeded for tool: ${toolName}` }
    }
    recentCalls.push(Date.now())
    this._callCounts.set(toolName, recentCalls)

    // Execute with timeout
    const timeout = perm.timeout || 30000
    try {
      const result = await Promise.race([
        tool.execute(input, context),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`Tool ${toolName} timed out`)), timeout)),
      ])
      return result || { output: null }
    } catch (err) {
      return { error: err.message }
    }
  }

  stats() {
    return Object.keys(this._tools).map(name => {
      const calls = this._callCounts.get(name) || []
      const recentCalls = calls.filter(t => t > Date.now() - 60000)
      return { name, callsLastMinute: recentCalls.length, limit: TOOL_PERMISSIONS[name]?.rateLimit }
    })
  }
}
