import { heartbeatText } from "./template.js"

const BASE = 30_000
const CAP = 5 * 60_000

export type PauseReason = "user" | "complete"

export type Entry = {
  enabled: boolean
  waiting: boolean
  paused: boolean
  pause_reason: PauseReason | null
  delay_ms: number
  next_at: number | null
  timer: unknown | null
  last_kind: "manual" | "heartbeat" | null
  seen: boolean
  run: boolean
  rev: number
  task_count: number
  live_ms: number
  live_tick_at: number | null
}

type Timer = {
  set: (ms: number, fn: () => void | Promise<void>) => unknown
  clear: (token: unknown) => void
}

type Opts = {
  now?: () => number
  send: (sessionID: string, text: string) => Promise<void>
  idle: (sessionID: string) => Promise<boolean>
  timer?: Timer
}

const grow = (ms: number) => Math.max(BASE, Math.round(ms * (ms >= CAP ? 3 : 1.3)))

const why = (why: PauseReason | null) => {
  if (why === "user") return "等待用户介入"
  if (why === "complete") return "任务已完成"
  return ""
}

const live = (ms: number) => {
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return `${sec}s`

  const min = Math.floor(sec / 60)
  const rem = sec % 60
  if (min < 60) return rem ? `${min}m ${rem}s` : `${min}m`

  const hour = Math.floor(min / 60)
  const rest = min % 60
  if (rest && rem) return `${hour}h ${rest}m ${rem}s`
  if (rest) return `${hour}h ${rest}m`
  if (rem) return `${hour}h ${rem}s`
  return `${hour}h`
}

export class Engine {
  #now
  #send
  #idle
  #timer
  #map = new Map<string, Entry>()

  constructor(opts: Opts) {
    this.#now = opts.now ?? Date.now
    this.#send = opts.send
    this.#idle = opts.idle
    this.#timer =
      opts.timer ?? {
        set: (ms, fn) => setTimeout(fn, ms),
        clear: (token) => clearTimeout(token as ReturnType<typeof setTimeout>),
      }
  }

  #clear(hit: Entry) {
    if (hit.timer !== null) this.#timer.clear(hit.timer)
    hit.timer = null
    hit.next_at = null
  }

  #reset(hit: Entry, kind: Entry["last_kind"] = null) {
    this.#clear(hit)
    hit.waiting = false
    hit.paused = false
    hit.pause_reason = null
    hit.delay_ms = BASE
    hit.last_kind = kind
    hit.seen = false
    hit.rev += 1
  }

  entry(sessionID: string) {
    return this.#map.get(sessionID)
  }

  enable(sessionID: string) {
    const hit = this.#map.get(sessionID)
    if (hit) this.#clear(hit)

    this.#map.set(sessionID, {
      enabled: true,
      waiting: false,
      paused: false,
      pause_reason: null,
      delay_ms: BASE,
      next_at: null,
      timer: null,
      last_kind: null,
      seen: false,
      run: false,
      rev: 0,
      task_count: 1,
      live_ms: 0,
      live_tick_at: this.#now(),
    })
  }

  disable(sessionID: string) {
    const hit = this.#map.get(sessionID)
    if (!hit) return
    this.#clear(hit)
    this.#map.delete(sessionID)
  }

  badge(sessionID: string) {
    const hit = this.#map.get(sessionID)
    if (!hit?.enabled) return ""

    const out = ["Auto-Working ON"]

    if (hit.paused) {
      out.push("∞")
      const text = why(hit.pause_reason)
      if (text) out.push(text)
    }

    if (!hit.paused && hit.waiting && hit.next_at !== null) {
      const sec = Math.max(0, Math.ceil((hit.next_at - this.#now()) / 1000))
      out.push(`${sec}s`)
    }

    out.push(`${hit.task_count} 个任务`)
    out.push(live(hit.live_ms))
    return out.join(" · ")
  }

  title(sessionID: string) {
    return this.#map.get(sessionID)?.enabled ? "Auto-Working: Disable" : "Auto-Working: Enable"
  }

  onAssistant(sessionID: string) {
    const hit = this.#map.get(sessionID)
    if (!hit?.enabled) return
    this.#reset(hit)
  }

  onManual(sessionID: string) {
    const hit = this.#map.get(sessionID)
    if (!hit?.enabled) return
    this.#reset(hit, "manual")
  }

  setTaskCount(sessionID: string, count: number) {
    const hit = this.#map.get(sessionID)
    if (!hit?.enabled) return
    hit.task_count = count
  }

  tick(sessionID: string) {
    const hit = this.#map.get(sessionID)
    if (!hit?.enabled || hit.live_tick_at === null) return

    const now = this.#now()
    hit.live_ms += Math.max(0, now - hit.live_tick_at)
    hit.live_tick_at = now
  }

  pause(sessionID: string, why: PauseReason) {
    const hit = this.#map.get(sessionID)
    if (!hit?.enabled) return
    this.#reset(hit)
    hit.paused = true
    hit.pause_reason = why
  }

  onBusy(sessionID: string) {
    const hit = this.#map.get(sessionID)
    if (!hit?.enabled || !hit.waiting) return
    hit.seen = true
  }

  async onIdle(sessionID: string) {
    const hit = this.#map.get(sessionID)
    if (!hit?.enabled || hit.run || hit.paused) return

    hit.run = true
    const rev = hit.rev

    try {
      if (!(await this.#idle(sessionID))) return
      if (this.#map.get(sessionID) !== hit || !hit.enabled || hit.rev !== rev) return

      if (hit.seen) {
        this.#reset(hit)
        return
      }
      if (hit.waiting && hit.next_at !== null && this.#now() < hit.next_at) return

      await this.#send(sessionID, heartbeatText())
      if (this.#map.get(sessionID) !== hit || !hit.enabled || hit.rev !== rev) return

      const ms = hit.waiting ? grow(hit.delay_ms) : hit.delay_ms
      hit.waiting = true
      hit.delay_ms = ms
      hit.next_at = this.#now() + ms
      hit.timer = this.#timer.set(ms, async () => {
        await this.onIdle(sessionID)
      })
      hit.last_kind = "heartbeat"
    } finally {
      hit.run = false
    }
  }
}
