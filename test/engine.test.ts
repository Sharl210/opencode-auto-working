import { expect, test } from "bun:test"
import { Engine } from "../src/engine"
import { MARK } from "../src/template"

function entry(engine: Engine) {
  const hit = engine.entry("ses_1")
  if (!hit) throw new Error("missing engine entry")
  return hit
}

function shift(timers: Array<() => void | Promise<void>>) {
  const fn = timers.shift()
  if (!fn) throw new Error("missing timer")
  return fn
}

test("shows no countdown until retry wait begins", () => {
  const engine = new Engine({
    now: () => 1_000,
    send: async () => {},
    idle: async () => true,
    timer: {
      set: () => Symbol("timer"),
      clear: () => {},
    },
  })

  engine.enable("ses_1")
  expect(engine.badge("ses_1")).toBe("Auto-Working ON · 1 个任务 · 0s")
})

test("shows the waiting-to-start pause badge", () => {
  const engine = new Engine({
    now: () => 0,
    send: async () => {},
    idle: async () => true,
    timer: {
      set: () => Symbol("timer"),
      clear: () => {},
    },
  })

  engine.enable("ses_1")
  engine.pause("ses_1", "start")

  expect(entry(engine).paused).toBe(true)
  expect(entry(engine).pause_reason).toBe("start")
  expect(engine.badge("ses_1")).toBe("Auto-Working ON · ∞ · 等待用户开始工作中... · 1 个任务 · 0s")
})

test("tracks task count and live runtime only in running state", () => {
  let now = 0
  const engine = new Engine({
    now: () => now,
    send: async () => {},
    idle: async () => true,
    timer: {
      set: () => Symbol("timer"),
      clear: () => {},
    },
  })

  engine.enable("ses_1")
  engine.setTaskCount("ses_1", 4)
  now = 5_000
  expect(engine.badge("ses_1")).toBe("Auto-Working ON · 4 个任务 · 0s")

  engine.tick("ses_1")
  expect(entry(engine).live_ms).toBe(5_000)
  expect(entry(engine).live_tick_at).toBe(5_000)
  expect(engine.badge("ses_1")).toBe("Auto-Working ON · 4 个任务 · 5s")

  entry(engine).waiting = true
  now = 8_000
  engine.tick("ses_1")
  expect(engine.badge("ses_1")).toBe("Auto-Working ON · 4 个任务 · 5s")
  expect(entry(engine).live_ms).toBe(5_000)
  expect(entry(engine).live_tick_at).toBe(8_000)
  expect(engine.badge("ses_1")).toBe("Auto-Working ON · 4 个任务 · 5s")
})

test("uses a 30 second base delay for the first wait", async () => {
  const sent: string[] = []
  const engine = new Engine({
    now: () => 0,
    send: async (_id, text) => {
      sent.push(text)
    },
    idle: async () => true,
    timer: {
      set: () => Symbol("timer"),
      clear: () => {},
    },
  })

  engine.enable("ses_1")
  await engine.onIdle("ses_1")

  expect(sent[0]).toContain(MARK)
  expect(entry(engine).waiting).toBe(true)
  expect(entry(engine).delay_ms).toBe(30_000)
  expect(entry(engine).next_at).toBe(30_000)
  expect(engine.badge("ses_1")).toBe("Auto-Working ON · 30s · 1 个任务 · 0s")
})

test("shows the waiting-for-user pause badge and clears waiting timers", async () => {
  const cleared: unknown[] = []
  const engine = new Engine({
    now: () => 0,
    send: async () => {},
    idle: async () => true,
    timer: {
      set: () => Symbol("timer"),
      clear: (token) => {
        cleared.push(token)
      },
    },
  })

  engine.enable("ses_1")
  await engine.onIdle("ses_1")
  engine.pause("ses_1", "user")

  expect(cleared).toHaveLength(1)
  expect(entry(engine).waiting).toBe(false)
  expect(entry(engine).paused).toBe(true)
  expect(entry(engine).pause_reason).toBe("user")
  expect(entry(engine).next_at).toBeNull()
  expect(engine.badge("ses_1")).toBe("Auto-Working ON · ∞ · 等待用户介入 · 1 个任务 · 0s")
})

test("shows the task-complete pause badge", () => {
  const engine = new Engine({
    now: () => 0,
    send: async () => {},
    idle: async () => true,
    timer: {
      set: () => Symbol("timer"),
      clear: () => {},
    },
  })

  engine.enable("ses_1")
  engine.pause("ses_1", "complete")

  expect(entry(engine).paused).toBe(true)
  expect(entry(engine).pause_reason).toBe("complete")
  expect(engine.badge("ses_1")).toBe("Auto-Working ON · ∞ · 任务已完成 · 1 个任务 · 0s")
})

test("shows the interrupted pause badge", () => {
  const engine = new Engine({
    now: () => 0,
    send: async () => {},
    idle: async () => true,
    timer: {
      set: () => Symbol("timer"),
      clear: () => {},
    },
  })

  engine.enable("ses_1")
  engine.pause("ses_1", "interrupt")

  expect(entry(engine).paused).toBe(true)
  expect(entry(engine).pause_reason).toBe("interrupt")
  expect(engine.badge("ses_1")).toBe("Auto-Working ON · ∞ · 用户主动打断中 · 1 个任务 · 0s")
})

test("start pause only exits after a busy-to-idle cycle", async () => {
  const engine = new Engine({
    now: () => 0,
    send: async () => {},
    idle: async () => true,
    timer: {
      set: () => Symbol("timer"),
      clear: () => {},
    },
  })

  engine.enable("ses_1")
  engine.pause("ses_1", "start")

  await engine.onIdle("ses_1")
  expect(entry(engine).paused).toBe(true)

  engine.onBusy("ses_1")
  await engine.onIdle("ses_1")
  expect(entry(engine).paused).toBe(false)
  expect(entry(engine).pause_reason).toBeNull()
})

test("coalesces concurrent onIdle calls into one send and one schedule", async () => {
  let releases = 0
  let sends = 0
  const timers: Array<() => void | Promise<void>> = []
  let unlock = () => {}
  const wait = new Promise<void>((resolve) => {
    unlock = () => {
      releases += 1
      resolve()
    }
  })

  const engine = new Engine({
    now: () => 0,
    send: async () => {
      sends += 1
      await wait
    },
    idle: async () => true,
    timer: {
      set: (_ms, fn) => {
        timers.push(fn)
        return timers.length
      },
      clear: () => {},
    },
  })

  engine.enable("ses_1")
  const a = engine.onIdle("ses_1")
  const b = engine.onIdle("ses_1")
  await Promise.resolve()
  await Promise.resolve()

  expect(timers).toHaveLength(0)

  unlock()
  await Promise.all([a, b])

  expect(releases).toBe(1)
  expect(sends).toBe(1)
  expect(timers).toHaveLength(1)
  expect(entry(engine).waiting).toBe(true)
  expect(entry(engine).delay_ms).toBe(30_000)
})

test("ignores an in-flight send after manual activity resets state", async () => {
  const timers: Array<() => void | Promise<void>> = []
  let unlock = () => {}
  const wait = new Promise<void>((resolve) => {
    unlock = resolve
  })
  const engine = new Engine({
    now: () => 0,
    send: async () => {
      await wait
    },
    idle: async () => true,
    timer: {
      set: (_ms, fn) => {
        timers.push(fn)
        return timers.length
      },
      clear: () => {},
    },
  })

  engine.enable("ses_1")
  const run = engine.onIdle("ses_1")
  engine.onManual("ses_1")
  unlock()
  await run

  expect(timers).toHaveLength(0)
  expect(entry(engine).waiting).toBe(false)
  expect(entry(engine).next_at).toBeNull()
  expect(entry(engine).last_kind).toBe("manual")
})

test("does not keep a stale timer after disable and re-enable during send", async () => {
  const timers: Array<() => void | Promise<void>> = []
  let unlock = () => {}
  const wait = new Promise<void>((resolve) => {
    unlock = resolve
  })
  const engine = new Engine({
    now: () => 0,
    send: async () => {
      await wait
    },
    idle: async () => true,
    timer: {
      set: (_ms, fn) => {
        timers.push(fn)
        return timers.length
      },
      clear: () => {},
    },
  })

  engine.enable("ses_1")
  const run = engine.onIdle("ses_1")
  engine.disable("ses_1")
  engine.enable("ses_1")
  unlock()
  await run

  expect(timers).toHaveLength(0)
  expect(entry(engine).waiting).toBe(false)
  expect(entry(engine).next_at).toBeNull()
})

test("grows retries by 1.3x before five minutes", async () => {
  let now = 0
  let token = 0
  const timers: Array<() => void | Promise<void>> = []
  const engine = new Engine({
    now: () => now,
    send: async () => {},
    idle: async () => true,
    timer: {
      set: (_ms, fn) => {
        timers.push(fn)
        token += 1
        return token
      },
      clear: () => {},
    },
  })

  engine.enable("ses_1")
  await engine.onIdle("ses_1")
  now += 30_000
  await shift(timers)()

  expect(entry(engine).delay_ms).toBe(39_000)
})

test("switches retries to 3x growth after five minutes", async () => {
  let now = 0
  let last = 0
  let token = 0
  const timers: Array<() => void | Promise<void>> = []
  const engine = new Engine({
    now: () => now,
    send: async () => {},
    idle: async () => true,
    timer: {
      set: (_ms, fn) => {
        timers.push(fn)
        token += 1
        return token
      },
      clear: () => {},
    },
  })

  engine.enable("ses_1")
  await engine.onIdle("ses_1")
  last = entry(engine).delay_ms

  while (last < 300_000) {
    now += last
    await shift(timers)()
    last = entry(engine).delay_ms
  }

  now += last
  await shift(timers)()

  expect(entry(engine).delay_ms).toBe(last * 3)
})

test("manual activity resets the waiting state", async () => {
  const cleared: unknown[] = []
  const engine = new Engine({
    now: () => 0,
    send: async () => {},
    idle: async () => true,
    timer: {
      set: () => Symbol("timer"),
      clear: (token) => {
        cleared.push(token)
      },
    },
  })

  engine.enable("ses_1")
  await engine.onIdle("ses_1")
  engine.onManual("ses_1")

  expect(cleared).toHaveLength(1)
  expect(entry(engine).waiting).toBe(false)
  expect(entry(engine).paused).toBe(false)
  expect(entry(engine).pause_reason).toBeNull()
  expect(entry(engine).delay_ms).toBe(30_000)
  expect(entry(engine).next_at).toBeNull()
  expect(engine.badge("ses_1")).toBe("Auto-Working ON · 1 个任务 · 0s")
})

test("all pause states only exit on the next idle", async () => {
  const engine = new Engine({
    now: () => 0,
    send: async () => {},
    idle: async () => true,
    timer: {
      set: () => Symbol("timer"),
      clear: () => {},
    },
  })

  engine.enable("ses_1")
  engine.pause("ses_1", "interrupt")
  engine.onManual("ses_1")
  expect(entry(engine).paused).toBe(true)

  await engine.onIdle("ses_1")
  expect(entry(engine).paused).toBe(false)
  expect(entry(engine).pause_reason).toBeNull()
  expect(entry(engine).waiting).toBe(false)
})

test("clears accumulated runtime on disable", () => {
  let now = 0
  const engine = new Engine({
    now: () => now,
    send: async () => {},
    idle: async () => true,
    timer: {
      set: () => Symbol("timer"),
      clear: () => {},
    },
  })

  engine.enable("ses_1")
  now = 5_000
  engine.tick("ses_1")
  expect(entry(engine).live_ms).toBe(5_000)

  engine.disable("ses_1")
  expect(engine.entry("ses_1")).toBeUndefined()
})

test("assistant activity resets the waiting state", async () => {
  const cleared: unknown[] = []
  const engine = new Engine({
    now: () => 0,
    send: async () => {},
    idle: async () => true,
    timer: {
      set: () => Symbol("timer"),
      clear: (token) => {
        cleared.push(token)
      },
    },
  })

  engine.enable("ses_1")
  await engine.onIdle("ses_1")
  engine.onAssistant("ses_1")

  expect(cleared).toHaveLength(1)
  expect(entry(engine).waiting).toBe(false)
  expect(entry(engine).paused).toBe(false)
  expect(entry(engine).pause_reason).toBeNull()
  expect(entry(engine).delay_ms).toBe(30_000)
  expect(entry(engine).next_at).toBeNull()
  expect(engine.badge("ses_1")).toBe("Auto-Working ON · 1 个任务 · 0s")
})

test("resets backoff when activity returns the tree to idle", async () => {
  let now = 0
  let token = 0
  const sent: string[] = []
  const cleared: unknown[] = []
  const timers: Array<() => void | Promise<void>> = []
  const engine = new Engine({
    now: () => now,
    send: async (_id, text) => {
      sent.push(text)
    },
    idle: async () => true,
    timer: {
      set: (_ms, fn) => {
        timers.push(fn)
        token += 1
        return token
      },
      clear: (token) => {
        cleared.push(token)
      },
    },
  })

  engine.enable("ses_1")
  await engine.onIdle("ses_1")
  now += 30_000
  await shift(timers)()
  expect(entry(engine).delay_ms).toBe(39_000)

  engine.onBusy("ses_1")
  now += 5_000
  await engine.onIdle("ses_1")

  expect(cleared).toContain(2)
  expect(sent).toHaveLength(2)
  expect(entry(engine).waiting).toBe(false)
  expect(entry(engine).delay_ms).toBe(30_000)
  expect(entry(engine).next_at).toBeNull()
})
