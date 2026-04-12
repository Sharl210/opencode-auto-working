import { expect, test } from "bun:test"
import { createEffect, createRoot } from "solid-js"
import { setup } from "../src/runtime"
import { COMPLETE_MARK, heartbeatText, WAITING_MARK } from "../src/template"

function create() {
  const evt = new Map<string, Array<(event: unknown) => void | Promise<void>>>()
  const prompt: Array<unknown> = []
  const slot: Array<{ slots: Record<string, () => unknown> }> = []
  const sessions = {
    root: { id: "root" },
    child: { id: "child", parentID: "root" },
  }
  const tree = {
    root: [{ id: "child" }],
    child: [],
  }
  const state = {
    root: { type: "idle" as const },
    child: { type: "idle" as const },
  }
  const msg = {
    root: [] as Array<{ id: string; role: "user" | "assistant" }>,
    child: [] as Array<{ id: string; role: "user" | "assistant" }>,
  }
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
      toast() {},
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
        messages(sessionID: "root" | "child") {
          return msg[sessionID]
        },
        status(sessionID: "root" | "child") {
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
        success: "green",
        info: "cyan",
        text: "white",
        textMuted: "gray",
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
        async prompt(input: unknown) {
          prompt.push(input)
          return { data: undefined }
        },
        async children(input: { sessionID: "root" | "child" }) {
          return { data: tree[input.sessionID] }
        },
        async status() {
          return { data: state }
        },
        async get(input: { sessionID: "root" | "child" }) {
          return { data: sessions[input.sessionID] }
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
    state,
    msg,
    clear: () => clear,
    refresh() {
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

test("renders the app badge without orphan text nodes", async () => {
  await import("@opentui/solid/runtime-plugin-support")
  const { testRender } = await import("@opentui/solid")
  const plugin = (await import("../src/plugin")).default
  const fx = create()

  await plugin.tui(fx.api as never, undefined, { id: "opencode:auto-working" } as never)
  await fx.cmd.all[0].onSelect?.()
  await fx.emit({ type: "session.idle", properties: { sessionID: "root" } } as never)

  const app = fx.slot[0]?.slots.app
  expect(typeof app).toBe("function")

  const out = await testRender(() => app!() as never)
  await out.renderOnce()
  expect(out.captureCharFrame()).toContain("Auto-Working")
})

test("renders the app slot safely before Auto-Working is enabled", async () => {
  await import("@opentui/solid/runtime-plugin-support")
  const { testRender } = await import("@opentui/solid")
  const plugin = (await import("../src/plugin")).default
  const fx = create()

  await plugin.tui(fx.api as never, undefined, { id: "opencode:auto-working" } as never)

  const app = fx.slot[0]?.slots.app
  expect(typeof app).toBe("function")

  const out = await testRender(() => app!() as never)
  await out.renderOnce()
  expect(out.captureCharFrame()).not.toContain("Auto-Working")
})

test("registers a toggle command", async () => {
  const fx = create()

  await setup(fx.api as never)

  expect(fx.cmd.all).toHaveLength(1)
  expect(fx.cmd.all[0]).toMatchObject({
    value: "auto-working.toggle",
    hidden: false,
  })

  await fx.cmd.all[0].onSelect?.()
  fx.refresh()
  if (fx.cmd.all.length === 0) throw new Error("command registration missing after toggle")
  expect(fx.cmd.all[0].title).toBe("Auto-Working: Disable")
  expect(fx.clear()).toBe(1)
})

test("sends heartbeat prompts through the sdk and resets after descendant retry returns idle", async () => {
  const fx = create()

  await setup(fx.api as never)
  fx.state.root = { type: "busy" }
  await fx.cmd.all[0].onSelect?.()

  fx.state.root = { type: "idle" }
  await fx.emit({ type: "session.idle", properties: { sessionID: "root" } } as never)
  expect(fx.prompt).toHaveLength(1)
  expect(fx.prompt[0]).toMatchObject({
    sessionID: "root",
    parts: [{ type: "text", text: heartbeatText() }],
  })

  fx.state.child = { type: "retry", attempt: 1, message: "wait", next: Date.now() + 1000 }
  await fx.emit({ type: "session.status", properties: { sessionID: "child", status: fx.state.child } } as never)
  fx.state.child = { type: "idle" }
  await fx.emit({ type: "session.idle", properties: { sessionID: "child" } } as never)
  await fx.emit({ type: "session.idle", properties: { sessionID: "root" } } as never)

  expect(fx.prompt).toHaveLength(2)
})

test("only treats non-heartbeat user text parts as manual input", async () => {
  const fx = create()

  await setup(fx.api as never)
  fx.state.root = { type: "busy" }
  await fx.cmd.all[0].onSelect?.()
  fx.state.root = { type: "idle" }
  await fx.emit({ type: "session.idle", properties: { sessionID: "root" } } as never)

  fx.msg.root.push({ id: "msg_1", role: "user" })
  await fx.emit({ type: "message.updated", properties: { sessionID: "root", info: { id: "msg_1", role: "user" } } } as never)
  await fx.emit({
    type: "message.part.updated",
    properties: { sessionID: "root", time: 1, part: { id: "part_1", messageID: "msg_1", type: "text", text: heartbeatText() } },
  } as never)
  await fx.emit({ type: "session.idle", properties: { sessionID: "root" } } as never)
  expect(fx.prompt).toHaveLength(1)

  fx.msg.root.push({ id: "msg_2", role: "user" })
  await fx.emit({ type: "message.updated", properties: { sessionID: "root", info: { id: "msg_2", role: "user" } } } as never)
  await fx.emit({
    type: "message.part.updated",
    properties: { sessionID: "root", time: 2, part: { id: "part_2", messageID: "msg_2", type: "text", text: "继续处理这个问题" } },
  } as never)
  await fx.emit({ type: "session.idle", properties: { sessionID: "root" } } as never)

  expect(fx.prompt).toHaveLength(2)
})

test("pauses only on explicit assistant markers", async () => {
  const fx = create()

  await setup(fx.api as never)
  fx.state.root = { type: "busy" }
  await fx.cmd.all[0].onSelect?.()
  fx.state.root = { type: "idle" }
  await fx.emit({ type: "session.idle", properties: { sessionID: "root" } } as never)

  fx.msg.root.push({ id: "msg_a", role: "assistant" })
  await fx.emit({ type: "message.updated", properties: { sessionID: "root", info: { id: "msg_a", role: "assistant" } } } as never)
  await fx.emit({
    type: "message.part.updated",
    properties: { sessionID: "root", time: 3, part: { id: "part_a", messageID: "msg_a", type: "text", text: `请等待 ${WAITING_MARK}` } },
  } as never)
  await fx.emit({ type: "message.updated", properties: { sessionID: "root", info: { id: "msg_a", role: "assistant" } } } as never)
  await fx.emit({ type: "session.idle", properties: { sessionID: "root" } } as never)
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

  await setup(fx.api as never)
  fx.state.root = { type: "busy" }
  await fx.cmd.all[0].onSelect?.()
  fx.state.root = { type: "idle" }
  await fx.emit({ type: "session.idle", properties: { sessionID: "root" } } as never)
  expect(fx.prompt).toHaveLength(1)

  await fx.emit({ type: "tui.command.execute", properties: { command: "session.interrupt" } } as never)
  await fx.emit({ type: "session.idle", properties: { sessionID: "root" } } as never)
  expect(fx.prompt).toHaveLength(1)

  await fx.emit({ type: "session.idle", properties: { sessionID: "root" } } as never)
  expect(fx.prompt).toHaveLength(2)
})

test("starts paused when enabled on an idle tree", async () => {
  const fx = create()

  await setup(fx.api as never)
  await fx.cmd.all[0].onSelect?.()
  fx.refresh()

  await fx.emit({ type: "session.idle", properties: { sessionID: "root" } } as never)
  expect(fx.prompt).toHaveLength(0)

  fx.state.root = { type: "busy" }
  await fx.emit({ type: "session.status", properties: { sessionID: "root", status: fx.state.root } } as never)
  fx.state.root = { type: "idle" }
  await fx.emit({ type: "session.idle", properties: { sessionID: "root" } } as never)
  expect(fx.prompt).toHaveLength(0)

  await fx.emit({ type: "session.idle", properties: { sessionID: "root" } } as never)
  expect(fx.prompt).toHaveLength(1)
})
