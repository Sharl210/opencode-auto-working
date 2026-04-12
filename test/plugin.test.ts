import { expect, test } from "bun:test"
import { setup } from "../src/runtime"
import { COMPLETE_MARK, heartbeatText, WAITING_MARK } from "../src/template"

function create() {
  const evt = new Map<string, Array<(event: unknown) => void | Promise<void>>>()
  const prompt: Array<unknown> = []
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
        cmd.all = cb()
        return () => {
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
      register() {
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
    prompt,
    state,
    msg,
    clear: () => clear,
    async emit(event: { type: string }) {
      for (const fn of evt.get(event.type) ?? []) {
        await fn(event)
      }
    },
  }
}

test("exports the runtime setup function", async () => {
  const mod = await import("../src/runtime")

  expect(typeof mod.setup).toBe("function")
  expect(typeof mod.current).toBe("function")
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
  expect(fx.cmd.all[0].title).toBe("Auto-Working: Disable")
  expect(fx.clear()).toBe(1)
})

test("sends heartbeat prompts through the sdk and resets after descendant retry returns idle", async () => {
  const fx = create()

  await setup(fx.api as never)
  await fx.cmd.all[0].onSelect?.()

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
  await fx.cmd.all[0].onSelect?.()
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
  await fx.cmd.all[0].onSelect?.()
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
