import { heartbeatText } from "./template.js"

const FIRST = 5_000
const BASE = 30_000
const CAP = 5 * 60_000

export type PauseReason = "user" | "complete" | "interrupt" | "start"

export type Entry = {
  enabled: boolean
  waiting: boolean
  paused: boolean
  pause_reason: PauseReason | null
  state_reason: PauseReason | null
  delay_ms: number
  next_at: number | null
  timer: unknown | null
  last_kind: "manual" | "heartbeat" | null
  seen: boolean
  run: boolean
  rev: number
  active_count: number
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
const next = (ms: number) => (ms < BASE ? BASE : grow(ms))

const why = (why: PauseReason | null) => {
  if (why === "start") return "等待用户开始工作中"
  if (why === "user") return "等待用户介入"
  if (why === "complete") return "任务已完成"
  if (why === "interrupt") return "用户主动打断中"
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

  #reset(hit: Entry, kind: Entry["last_kind"] = null, show: PauseReason | null = null) {
    this.#clear(hit)
    hit.waiting = false
    hit.paused = false
    hit.pause_reason = null
    hit.state_reason = show
    hit.delay_ms = FIRST
    hit.last_kind = kind
    hit.seen = false
    hit.live_tick_at = this.#now()
    hit.rev += 1
  }

  #arm(sessionID: string, hit: Entry, ms: number) {
    hit.next_at = this.#now() + ms
    hit.timer = this.#timer.set(ms, async () => {
      if (hit.timer !== null) hit.timer = null
      await this.onIdle(sessionID)
    })
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
      state_reason: null,
      delay_ms: FIRST,
      next_at: null,
      timer: null,
      last_kind: null,
      seen: false,
      run: false,
      rev: 0,
      active_count: 0,
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

  line1(sessionID: string) {
    const hit = this.#map.get(sessionID)
    if (!hit?.enabled) return ""
    return "Auto-Working: ON"
  }

  line2(sessionID: string) {
    const hit = this.#map.get(sessionID)
    if (!hit?.enabled) return ""
    if (hit.paused) return `状态: ${why(hit.pause_reason)}`
    if (hit.waiting) return "状态: 等待发送中"
    if (hit.active_count > 0) return "状态: 正在运行中"
    return `状态: ${why(hit.state_reason ?? "start")}`
  }

  line3(sessionID: string) {
    const hit = this.#map.get(sessionID)
    if (!hit?.enabled) return ""
    if (hit.paused) return "距离下次重发剩余: ∞"
    if (!hit.waiting || hit.next_at === null) return ""
    const sec = Math.max(0, Math.ceil((hit.next_at - this.#now()) / 1000))
    return `距离下次重发剩余: ${sec}s`
  }

  line4(sessionID: string) {
    const hit = this.#map.get(sessionID)
    if (!hit?.enabled) return ""
    return `进行中任务数: ${hit.active_count}`
  }

  line5(sessionID: string) {
    const hit = this.#map.get(sessionID)
    if (!hit?.enabled) return ""
    return `模式已持续运行: ${live(hit.live_ms)}`
  }

  badge(sessionID: string) {
    return [this.line1(sessionID), this.line2(sessionID), this.line3(sessionID), this.line4(sessionID), this.line5(sessionID)].filter(Boolean).join("\n")
  }

  title(sessionID: string) {
    return this.#map.get(sessionID)?.enabled ? "Auto-Working: Disable" : "Auto-Working: Enable"
  }

  onAssistant(sessionID: string) {
    const hit = this.#map.get(sessionID)
    if (!hit?.enabled) return
    if (hit.paused) return
    this.#reset(hit)
  }

  onManual(sessionID: string) {
    const hit = this.#map.get(sessionID)
    if (!hit?.enabled) return
    if (hit.paused) return
    this.#reset(hit, "manual")
  }

  setActiveCount(sessionID: string, count: number) {
    const hit = this.#map.get(sessionID)
    if (!hit?.enabled) return
    hit.active_count = count
  }

  tick(sessionID: string) {
    const hit = this.#map.get(sessionID)
    if (!hit?.enabled || hit.live_tick_at === null) return

    const now = this.#now()
    if (hit.waiting || hit.paused || hit.active_count < 1) {
      hit.live_tick_at = now
      return
    }
    hit.live_ms += Math.max(0, now - hit.live_tick_at)
    hit.live_tick_at = now
  }

  pause(sessionID: string, why: PauseReason) {
    const hit = this.#map.get(sessionID)
    if (!hit?.enabled) return
    this.#reset(hit, null, why)
    hit.paused = true
    hit.pause_reason = why
    hit.seen = why !== "start"
    hit.live_tick_at = this.#now()
  }

  onBusy(sessionID: string) {
    const hit = this.#map.get(sessionID)
    if (!hit?.enabled) return
    if (hit.paused) {
      if (hit.pause_reason === "start") {
        this.#reset(hit)
        return
      }
      hit.seen = true
      return
    }
    if (!hit.waiting) return
    this.#reset(hit)
  }

  async onIdle(sessionID: string) {
    const hit = this.#map.get(sessionID)
    if (!hit?.enabled) return
    if (hit.run) {
      if (!hit.waiting || hit.paused) return
      if (hit.timer !== null) return
      const rest = hit.next_at === null ? 200 : Math.max(50, hit.next_at - this.#now())
      this.#arm(sessionID, hit, rest)
      return
    }

    hit.run = true
    const rev = hit.rev

    try {
      if (!(await this.#idle(sessionID))) {
        if (hit.waiting) this.#reset(hit)
        return
      }
      if (this.#map.get(sessionID) !== hit || !hit.enabled || hit.rev !== rev) return

      if (hit.paused) {
        if (!hit.seen) return
        const show = hit.pause_reason
        const start = show === "start"
        this.#reset(hit, null, show)
        if (!start) return
      }

      if (hit.seen) {
        this.#reset(hit)
        return
      }

      if (!hit.waiting) {
        const ms = hit.delay_ms
        hit.waiting = true
        this.#arm(sessionID, hit, ms)
        return
      }

      if (hit.next_at !== null && this.#now() < hit.next_at) {
        if (hit.timer === null) {
          this.#arm(sessionID, hit, Math.max(50, hit.next_at - this.#now()))
        }
        return
      }

      if (hit.timer !== null) {
        this.#timer.clear(hit.timer)
        hit.timer = null
      }

      try {
        await this.#send(sessionID, heartbeatText())
      } catch {
        this.#reset(hit)
        return
      }
      if (this.#map.get(sessionID) !== hit || !hit.enabled || hit.rev !== rev) return

      const ms = next(hit.delay_ms)
      hit.delay_ms = ms
      this.#arm(sessionID, hit, ms)
      hit.last_kind = "heartbeat"
    } finally {
      hit.run = false
    }
  }
}
