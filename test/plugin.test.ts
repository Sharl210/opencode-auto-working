import { expect, test } from "bun:test"
import { RGBA } from "@opentui/core"
import { createEffect, createRoot } from "solid-js"
import { durationParts, split } from "../src/format"
import { setup } from "../src/runtime"
import { COMPLETE_MARK, heartbeatText, WAITING_MARK } from "../src/template"

async function settle() {
  await Promise.resolve()
  await Promise.resolve()
}

function create() {
  const evt = new Map<string, Array<(event: unknown) => void | Promise<void>>>()
  const prompt: Array<unknown> = []
  const promptOpt: Array<unknown> = []
  const tuiAppend: Array<unknown> = []
  const tuiAppendOpt: Array<unknown> = []
  const tuiSelect: Array<unknown> = []
  const tuiSelectOpt: Array<unknown> = []
  const tuiSubmit: Array<unknown> = []
  const tuiSubmitOpt: Array<unknown> = []
  const toast: Array<{ variant?: string; title?: string; message: string; duration?: number }> = []
  const slot: Array<{ slots: Record<string, () => unknown> }> = []
  const timers: Array<{ at: number; fn: () => void | Promise<void>; token: number }> = []
  const sessions = {
    root: { id: "root" },
    child: { id: "child", parentID: "root" },
    other: { id: "other" },
  }
  const tree = {
    root: [{ id: "child" }],
    child: [],
    other: [],
  }
  const state = {
    root: { type: "idle" as const },
    child: { type: "idle" as const },
    other: { type: "idle" as const },
  }
  const msg = {
    root: [] as Array<{ id: string; role: "user" | "assistant" }>,
    child: [] as Array<{ id: string; role: "user" | "assistant" }>,
    other: [] as Array<{ id: string; role: "user" | "assistant" }>,
  }
  let seq = 0
  let now = 0
  let token = 0
  let clear = 0
  const cmd = {
    all: [] as Array<{
      title: string
      value: string
      hidden: boolean
      onSelect?: () => Promise<void>
    }>,
  }
  let reg: (() => typeof cmd.all) | undefined
  let dispose: (() => void) | undefined
  const route = {
    current: {
      name: "session" as const,
      params: { sessionID: "root" },
    },
  }

  const api = {
    app: { version: "test" },
    command: {
      register(cb: () => typeof cmd.all) {
        reg = cb
        cmd.all = cb()
        dispose = createRoot((kill) => {
          createEffect(() => {
            cmd.all = cb()
          })
          return kill
        })
        return () => {
          reg = undefined
          dispose?.()
          dispose = undefined
          cmd.all = []
        }
      },
      trigger() {},
    },
    route: {
      register() {
        return () => {}
      },
      navigate() {},
      get current() {
        return route.current
      },
    },
    ui: {
      Dialog() {
        return null
      },
      DialogAlert() {
        return null
      },
      DialogConfirm() {
        return null
      },
      DialogPrompt() {
        return null
      },
      DialogSelect() {
        return null
      },
      Prompt() {
        return null
      },
      toast(input: { variant?: string; title?: string; message: string; duration?: number }) {
        toast.push(input)
      },
      dialog: {
        replace() {},
        clear() {
          clear += 1
        },
        setSize() {},
        get size() {
          return "medium" as const
        },
        get depth() {
          return 0
        },
        get open() {
          return false
        },
      },
    },
    keybind: {
      match() {
        return false
      },
      print(name: string) {
        return name
      },
      create() {
        return {
          all: {},
          get(name: string) {
            return name
          },
          match() {
            return false
          },
          print(name: string) {
            return name
          },
        }
      },
    },
    tuiConfig: {},
    kv: {
      get<T>(_: string, fallback?: T) {
        return fallback
      },
      set() {},
      ready: true,
    },
    state: {
      ready: true,
      config: {},
      provider: [],
      path: {
        state: "",
        config: "",
        worktree: "",
        directory: "/tmp/project",
      },
      vcs: undefined,
      workspace: {
        list() {
          return []
        },
        get() {
          return undefined
        },
      },
      session: {
        count() {
          return 0
        },
        diff() {
          return []
        },
        todo() {
          return []
        },
        messages(sessionID: "root" | "child" | "other") {
          return msg[sessionID]
        },
        status(sessionID: "root" | "child" | "other") {
          return state[sessionID]
        },
        permission() {
          return []
        },
        question() {
          return []
        },
      },
      part() {
        return []
      },
      lsp() {
        return []
      },
      mcp() {
        return []
      },
    },
    theme: {
      current: {
        background: RGBA.fromInts(12, 12, 12),
        backgroundPanel: RGBA.fromInts(20, 20, 20),
        success: RGBA.fromInts(32, 220, 160),
        info: RGBA.fromInts(80, 180, 255),
        text: RGBA.fromInts(255, 255, 255),
        textMuted: RGBA.fromInts(160, 160, 160),
      },
      selected: "",
      has() {
        return false
      },
      set() {
        return false
      },
      async install() {},
      mode() {
        return "dark" as const
      },
      ready: true,
    },
    client: {
      session: {
        async prompt(input: unknown, options?: unknown) {
          prompt.push(input)
          promptOpt.push(options)
          return { data: undefined }
        },
        async promptAsync(input: unknown, options?: unknown) {
          prompt.push(input)
          promptOpt.push(options)
          return { data: undefined }
        },
        async children(input: { sessionID: "root" | "child" | "other" }) {
          return { data: tree[input.sessionID] }
        },
        async status() {
          return { data: state }
        },
        async get(input: { sessionID: "root" | "child" | "other" }) {
          return { data: sessions[input.sessionID] }
        },
        async messages(input: { sessionID: "root" | "child" | "other" }) {
          return {
            data: msg[input.sessionID].map((info) => ({
              info,
              parts: [],
            })),
          }
        },
      },
      tui: {
        async appendPrompt(input: unknown, options?: unknown) {
          tuiAppend.push(input)
          tuiAppendOpt.push(options)
          return { data: undefined }
        },
        async submitPrompt(input?: unknown, options?: unknown) {
          tuiSubmit.push(input)
          tuiSubmitOpt.push(options)
          const id = route.current.params.sessionID as "root" | "child" | "other"
          seq += 1
          msg[id].push({ id: `auto_${seq}`, role: "user" })
          return { data: undefined }
        },
        async selectSession(input?: { sessionID?: "root" | "child" | "other" }, options?: unknown) {
          tuiSelect.push(input)
          tuiSelectOpt.push(options)
          if (input?.sessionID) route.current.params.sessionID = input.sessionID
          return { data: undefined }
        },
      },
    },
    scopedClient() {
      return api.client
    },
    workspace: {
      current() {
        return undefined
      },
      set() {},
    },
    event: {
      on(type: string, handler: (event: unknown) => void | Promise<void>) {
        const list = evt.get(type) ?? []
        list.push(handler)
        evt.set(type, list)
        return () => {
          const next = (evt.get(type) ?? []).filter((item) => item !== handler)
          evt.set(type, next)
        }
      },
    },
    renderer: {},
    slots: {
      register(input: { slots: Record<string, () => unknown> }) {
        slot.push(input)
        return "slot"
      },
    },
    plugins: {
      list() {
        return []
      },
      async activate() {
        return false
      },
      async deactivate() {
        return false
      },
      async add() {
        return false
      },
      async install() {
        return { ok: false as const, message: "nope" }
      },
    },
    lifecycle: {
      signal: new AbortController().signal,
      onDispose() {
        return () => {}
      },
    },
  }

  return {
    api,
    cmd,
    slot,
    prompt,
    promptOpt,
    tuiAppend,
    tuiAppendOpt,
    tuiSelect,
    tuiSelectOpt,
    tuiSubmit,
    tuiSubmitOpt,
    toast,
    state,
    msg,
    timer: {
      set(ms: number, fn: () => void | Promise<void>) {
        token += 1
        timers.push({ at: now + ms, fn, token })
        return token
      },
      clear(hit: unknown) {
        const idx = timers.findIndex((item) => item.token === hit)
        if (idx >= 0) timers.splice(idx, 1)
      },
    },
    now: () => now,
    clear: () => clear,
    refresh() {
      if (reg) cmd.all = reg()
    },
    async advance(ms: number) {
      now += ms
      while (true) {
        const hit = timers
          .filter((item) => item.at <= now)
          .sort((a, b) => a.at - b.at || a.token - b.token)[0]
        if (!hit) break
        const idx = timers.findIndex((item) => item.token === hit.token)
        if (idx >= 0) timers.splice(idx, 1)
        await hit.fn()
      }
      if (reg) cmd.all = reg()
    },
    async emit(event: { type: string }) {
      for (const fn of evt.get(event.type) ?? []) {
        await fn(event)
      }
      if (reg) cmd.all = reg()
    },
  }
}

test("exports the runtime setup function", async () => {
  const mod = await import("../src/runtime")

  expect(typeof mod.setup).toBe("function")
  expect(typeof mod.current).toBe("function")
})

test("parses key-value rows and duration values without hardcoded labels", () => {
  expect(split("Auto-Working: ON")).toEqual({
    key: "Auto-Working: ",
    value: "ON",
    duration: null,
  })

  expect(split("状态: 正在运行中")).toEqual({
    key: "状态: ",
    value: "正在运行中",
    duration: null,
  })

  expect(split("任意文案: 12s")).toEqual({
    key: "任意文案: ",
    value: "12s",
    duration: [{ n: "12", u: "s" }],
  })

  expect(split("模式已持续运行: 1h 2m 3s")).toEqual({
    key: "模式已持续运行: ",
    value: "1h 2m 3s",
    duration: [
      { n: "1", u: "h" },
      { n: "2", u: "m" },
      { n: "3", u: "s" },
    ],
  })

  expect(durationParts("5s")).toEqual([{ n: "5", u: "s" }])
  expect(durationParts("1h 2m 3s")).toEqual([
    { n: "1", u: "h" },
    { n: "2", u: "m" },
    { n: "3", u: "s" },
  ])
})

test("renders the sidebar content without orphan text nodes", async () => {
  await import("@opentui/solid/runtime-plugin-support")
  const { testRender } = await import("@opentui/solid")
  const plugin = (await import("../src/plugin")).default
  const fx = create()

  await plugin.tui(fx.api as never, undefined, { id: "opencode:auto-working" } as never)
  await fx.cmd.all[0].onSelect?.()
  await fx.emit({ type: "session.idle", properties: { sessionID: "root" } } as never)

  const section = fx.slot[0]?.slots.sidebar_content
  if (typeof section !== "function") throw new Error("sidebar content slot missing")

  const out = await testRender(() => section() as never)
  await out.renderOnce()
  expect(out.captureCharFrame()).toContain("Auto-Working")
})

test("renders countdown values inline instead of dropping them", async () => {
  await import("@opentui/solid/runtime-plugin-support")
  const { testRender } = await import("@opentui/solid")
  const plugin = (await import("../src/plugin")).default
  const fx = create()

  await plugin.tui(fx.api as never, undefined, { id: "opencode:auto-working" } as never)
  fx.state.root = { type: "busy" }
  await fx.cmd.all[0].onSelect?.()
  fx.state.root = { type: "idle" }
  await fx.emit({ type: "session.idle", properties: { sessionID: "root" } } as never)

  const section = fx.slot[0]?.slots.sidebar_content
  if (typeof section !== "function") throw new Error("sidebar content slot missing")

  const out = await testRender(() => section() as never)
  await out.renderOnce()
  expect(out.captureCharFrame()).toContain("距离下次重发剩余: 5s")
})

test("renders the sidebar content safely before Auto-Working is enabled", async () => {
  await import("@opentui/solid/runtime-plugin-support")
  const { testRender } = await import("@opentui/solid")
  const plugin = (await import("../src/plugin")).default
  const fx = create()

  await plugin.tui(fx.api as never, undefined, { id: "opencode:auto-working" } as never)

  const section = fx.slot[0]?.slots.sidebar_content
  if (typeof section !== "function") throw new Error("sidebar content slot missing")

  const out = await testRender(() => section() as never)
  await out.renderOnce()
  expect(out.captureCharFrame()).toContain("Auto-Working: OFF")
  expect(out.captureCharFrame()).toContain("进行中任务数: 0")
  expect(out.captureCharFrame()).not.toContain("状态:")
})

test("shows active task count while Auto-Working stays off", async () => {
  await import("@opentui/solid/runtime-plugin-support")
  const { testRender } = await import("@opentui/solid")
  const plugin = (await import("../src/plugin")).default
  const fx = create()

  await plugin.tui(fx.api as never, undefined, { id: "opencode:auto-working" } as never)
  fx.state.root = { type: "busy" }
  await fx.emit({ type: "session.status", properties: { sessionID: "root", status: fx.state.root } } as never)

  const section = fx.slot[0]?.slots.sidebar_content
  if (typeof section !== "function") throw new Error("sidebar content slot missing")

  const out = await testRender(() => section() as never)
  await out.renderOnce()
  expect(out.captureCharFrame()).toContain("Auto-Working: OFF")
  expect(out.captureCharFrame()).toContain("进行中任务数: 1")
})

test("does not send heartbeat before manual enable", async () => {
  const fx = create()

  await setup(fx.api as never, { now: fx.now, timer: fx.timer })
  fx.state.root = { type: "busy" }
  await fx.emit({ type: "session.status", properties: { sessionID: "root", status: fx.state.root } } as never)
  fx.state.root = { type: "idle" }
  await fx.emit({ type: "session.idle", properties: { sessionID: "root" } } as never)
  await fx.advance(60_000)

  expect(fx.prompt).toHaveLength(0)
  expect(fx.tuiAppend).toHaveLength(0)
  expect(fx.tuiSubmit).toHaveLength(0)
})

test("registers a toggle command", async () => {
  const fx = create()

  await setup(fx.api as never, { now: fx.now, timer: fx.timer })

  expect(fx.cmd.all).toHaveLength(1)
  expect(fx.cmd.all[0]).toMatchObject({
    value: "auto-working.toggle",
    hidden: false,
    category: "Session",
  })

  await fx.cmd.all[0].onSelect?.()
  fx.refresh()
  if (fx.cmd.all.length === 0) throw new Error("command registration missing after toggle")
  expect(fx.cmd.all[0].title).toBe("Auto-Working: Disable")
  expect(fx.clear()).toBe(1)
})

test("sends heartbeat prompts through the sdk and resets after descendant retry returns idle", async () => {
  const fx = create()

  await setup(fx.api as never, { now: fx.now, timer: fx.timer })
  fx.state.root = { type: "busy" }
  await fx.cmd.all[0].onSelect?.()
  await settle()

  fx.state.root = { type: "idle" }
  await fx.emit({ type: "session.idle", properties: { sessionID: "root" } } as never)
  await fx.advance(5_000)
  expect(fx.prompt).toHaveLength(1)
  expect(fx.prompt[0]).toMatchObject({
    sessionID: "root",
    parts: [{ type: "text", text: heartbeatText() }],
  })
  expect(fx.promptOpt[0]).toMatchObject({ throwOnError: true })

  fx.state.child = { type: "retry", attempt: 1, message: "wait", next: Date.now() + 1000 }
  await fx.emit({ type: "session.status", properties: { sessionID: "child", status: fx.state.child } } as never)
  fx.state.child = { type: "idle" }
  await fx.emit({ type: "session.idle", properties: { sessionID: "child" } } as never)
  await fx.emit({ type: "session.idle", properties: { sessionID: "root" } } as never)
  await fx.advance(5_000)

  expect(fx.prompt).toHaveLength(2)
})

test("only treats non-heartbeat user text parts as manual input", async () => {
  const fx = create()

  await setup(fx.api as never, { now: fx.now, timer: fx.timer })
  fx.state.root = { type: "busy" }
  await fx.cmd.all[0].onSelect?.()
  await settle()
  fx.state.root = { type: "idle" }
  await fx.emit({ type: "session.idle", properties: { sessionID: "root" } } as never)
  await fx.advance(5_000)

  fx.msg.root.push({ id: "msg_1", role: "user" })
  await fx.emit({ type: "message.updated", properties: { sessionID: "root", info: { id: "msg_1", role: "user" } } } as never)
  await fx.emit({
    type: "message.part.updated",
    properties: { sessionID: "root", time: 1, part: { id: "part_1", messageID: "msg_1", type: "text", text: heartbeatText() } },
  } as never)
  await fx.emit({ type: "session.idle", properties: { sessionID: "root" } } as never)
  await settle()
  expect(fx.prompt).toHaveLength(1)

  fx.msg.root.push({ id: "msg_2", role: "user" })
  await fx.emit({ type: "message.updated", properties: { sessionID: "root", info: { id: "msg_2", role: "user" } } } as never)
  await fx.emit({
    type: "message.part.updated",
    properties: { sessionID: "root", time: 2, part: { id: "part_2", messageID: "msg_2", type: "text", text: "继续处理这个问题" } },
  } as never)
  await fx.emit({ type: "session.idle", properties: { sessionID: "root" } } as never)
  await fx.advance(5_000)

  expect(fx.prompt).toHaveLength(2)
})

test("pauses only on explicit assistant markers", async () => {
  const fx = create()

  await setup(fx.api as never, { now: fx.now, timer: fx.timer })
  fx.state.root = { type: "busy" }
  await fx.cmd.all[0].onSelect?.()
  await settle()
  fx.state.root = { type: "idle" }
  await fx.emit({ type: "session.idle", properties: { sessionID: "root" } } as never)
  await fx.advance(5_000)

  fx.msg.root.push({ id: "msg_a", role: "assistant" })
  await fx.emit({ type: "message.updated", properties: { sessionID: "root", info: { id: "msg_a", role: "assistant" } } } as never)
  await fx.emit({
    type: "message.part.updated",
    properties: { sessionID: "root", time: 3, part: { id: "part_a", messageID: "msg_a", type: "text", text: `请等待 ${WAITING_MARK}` } },
  } as never)
  await fx.emit({ type: "message.updated", properties: { sessionID: "root", info: { id: "msg_a", role: "assistant" } } } as never)
  await fx.emit({ type: "session.idle", properties: { sessionID: "root" } } as never)
  await settle()
  expect(fx.prompt).toHaveLength(1)

  fx.msg.root.push({ id: "msg_b", role: "assistant" })
  await fx.emit({ type: "message.updated", properties: { sessionID: "root", info: { id: "msg_b", role: "assistant" } } } as never)
  await fx.emit({
    type: "message.part.updated",
    properties: { sessionID: "root", time: 4, part: { id: "part_b", messageID: "msg_b", type: "text", text: `现在可以停了 ${COMPLETE_MARK}` } },
  } as never)
  await fx.emit({ type: "session.idle", properties: { sessionID: "root" } } as never)
  expect(fx.prompt).toHaveLength(1)
})

test("pauses on user interrupt until the next idle", async () => {
  const fx = create()

  await setup(fx.api as never, { now: fx.now, timer: fx.timer })
  fx.state.root = { type: "busy" }
  await fx.cmd.all[0].onSelect?.()
  await settle()
  fx.state.root = { type: "idle" }
  await fx.emit({ type: "session.idle", properties: { sessionID: "root" } } as never)
  await fx.advance(5_000)
  expect(fx.prompt).toHaveLength(1)

  await fx.emit({ type: "tui.command.execute", properties: { command: "session.interrupt" } } as never)
  await fx.emit({ type: "session.idle", properties: { sessionID: "root" } } as never)
  expect(fx.prompt).toHaveLength(1)

  await fx.emit({ type: "session.idle", properties: { sessionID: "root" } } as never)
  await fx.advance(5_000)
  expect(fx.prompt).toHaveLength(2)
})

test("interrupt overrides the initial start-pause label", async () => {
  const fx = create()
  const rt = await setup(fx.api as never, { now: fx.now, timer: fx.timer })

  await fx.cmd.all[0].onSelect?.()
  expect(rt.eng.line2("root")).toBe("状态: 等待用户开始工作中")

  await fx.emit({ type: "tui.command.execute", properties: { command: "session.interrupt" } } as never)
  expect(rt.eng.line2("root")).toBe("状态: 用户主动打断中")

  await fx.emit({ type: "session.idle", properties: { sessionID: "root" } } as never)
  expect(rt.eng.line2("root")).toBe("状态: 用户主动打断中")
})

test("starts paused when enabled on an idle tree", async () => {
  const fx = create()

  await setup(fx.api as never, { now: fx.now, timer: fx.timer })
  await fx.cmd.all[0].onSelect?.()
  fx.refresh()

  await fx.emit({ type: "session.idle", properties: { sessionID: "root" } } as never)
  expect(fx.prompt).toHaveLength(0)

  fx.state.root = { type: "busy" }
  await fx.emit({ type: "session.status", properties: { sessionID: "root", status: fx.state.root } } as never)
  fx.state.root = { type: "idle" }
  await fx.emit({ type: "session.idle", properties: { sessionID: "root" } } as never)
  expect(fx.prompt).toHaveLength(0)
  await fx.advance(5_000)
  expect(fx.prompt).toHaveLength(1)
})

test("follows the current session tree when the route switches", async () => {
  const fx = create()
  const rt = await setup(fx.api as never, { now: fx.now, timer: fx.timer })

  await fx.cmd.all[0].onSelect?.()
  fx.state.root = { type: "busy" }
  await fx.emit({ type: "session.status", properties: { sessionID: "root", status: fx.state.root } } as never)

  fx.api.route.current.params.sessionID = "other"
  await rt.follow("other")

  expect(rt.eng.entry("root")?.enabled).toBe(false)
  expect(rt.eng.line1("root")).toBe("Auto-Working: OFF")
  expect(rt.eng.entry("other")?.enabled).toBe(true)
})

test("enables the root conversation tree when toggled from a child session", async () => {
  const fx = create()
  fx.api.route.current.params.sessionID = "child"
  const rt = await setup(fx.api as never, { now: fx.now, timer: fx.timer })

  await fx.cmd.all[0].onSelect?.()
  await settle()
  await settle()

  expect(rt.eng.entry("root")?.enabled).toBe(true)
  expect(rt.eng.entry("child")).toBeUndefined()
})

test("falls back to TUI prompt submit when session prompt fails", async () => {
  const fx = create()
  fx.api.route.current.params.sessionID = "child"

  await setup(fx.api as never, { now: fx.now, timer: fx.timer })

  fx.api.client.session.promptAsync = async () => {
    throw new Error("send failed")
  }

  fx.state.root = { type: "busy" }
  await fx.cmd.all[0].onSelect?.()
  await settle()
  await settle()

  fx.state.root = { type: "idle" }
  await fx.emit({ type: "session.idle", properties: { sessionID: "root" } } as never)
  await fx.advance(5_000)

  expect(fx.prompt).toHaveLength(0)
  expect(fx.tuiAppend).toContainEqual({ text: heartbeatText() })
  expect(fx.tuiSubmit).toHaveLength(1)
  expect(fx.tuiSelect[0]).toEqual({ sessionID: "root" })
  expect(fx.tuiSelect[1]).toEqual({ sessionID: "child" })
  expect(fx.toast.some((item) => item.message.includes("心跳发送失败"))).toBe(false)
})
