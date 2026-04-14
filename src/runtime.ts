import type { TuiPluginApi } from "@opencode-ai/plugin/tui"
import type { Message, Part } from "@opencode-ai/sdk/v2"
import { createSignal } from "solid-js"
import { Engine } from "./engine.js"
import { stats, treeIdle } from "./probe.js"
import { hasCompleteMarker, hasWaitingMarker, isHeartbeatText } from "./template.js"

type Timer = ConstructorParameters<typeof Engine>[0]["timer"]

type Opts = {
  now?: () => number
  timer?: Timer
}

export function current(api: TuiPluginApi): string | undefined {
  const route = api.route.current
  if (route.name !== "session") return undefined
  const data = "data" in route ? route.data : undefined
  if (typeof data === "object" && data !== null && "sessionID" in data && typeof data.sessionID === "string") {
    return data.sessionID
  }
  return typeof route.params?.sessionID === "string" ? route.params.sessionID : undefined
}

export async function setup(api: TuiPluginApi, opts: Opts = {}) {
  const root = new Map<string, string>()
  const role = new Map<string, Message["role"]>()
  const paused = new Set<string>()
  const [rev, setRev] = createSignal(0)
  let live: string | undefined
  let head: string | undefined

  const limit = async <T>(ms: number, fn: () => Promise<T>) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        fn(),
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => {
            reject(new Error(`timeout:${ms}`))
          }, ms)
        }),
      ])
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  const eng = new Engine({
    now: opts.now,
    send: async (sessionID, text) => {
      const wait = (ms: number) =>
        new Promise<void>((resolve) => {
          setTimeout(resolve, ms)
        })

      const users = async () => {
        const res = await api.client.session.messages(
          {
            sessionID,
            limit: 50,
          },
          {
            throwOnError: true,
          },
        )
        const role = (item: { info?: { role?: Message["role"] }; role?: Message["role"] }) => item.info?.role ?? item.role
        return (res.data ?? []).filter((item) => role(item) === "user").length
      }

      const submit = async () => {
        await limit(12_000, () =>
          api.client.session.promptAsync(
            {
              sessionID,
              parts: [{ type: "text", text }],
            },
            {
              throwOnError: true,
            },
          ),
        )
      }

      const submitViaTui = async () => {
        const cur = current(api)
        const switchBack = cur && cur !== sessionID
        const before = await users().catch(() => 0)
        if (switchBack) {
          await api.client.tui.selectSession(
            { sessionID },
            {
              throwOnError: true,
            },
          )
        }

        try {
          await api.client.tui.appendPrompt(
            { text },
            {
              throwOnError: true,
            },
          )
          await api.client.tui.submitPrompt(
            {},
            {
              throwOnError: true,
            },
          )

          for (let i = 0; i < 20; i += 1) {
            const after = await users().catch(() => before)
            if (after > before) return
            await wait(150)
          }

          throw new Error("tui_submit_no_user_message")
        } finally {
          if (switchBack) {
            await api.client.tui.selectSession(
              { sessionID: cur },
              {
                throwOnError: true,
              },
            )
          }
        }
      }

      try {
        await submit()
      } catch (primary) {
        try {
          await limit(16_000, submitViaTui)
          return
        } catch (fallback) {
          const p = primary instanceof Error ? primary.message : String(primary)
          const f = fallback instanceof Error ? fallback.message : String(fallback)
          api.ui.toast({
            variant: "error",
            message: `Auto-Working 心跳发送失败: ${p}; fallback失败: ${f}`,
          })
          throw fallback
        }
      }
    },
    idle: async (sessionID) => {
      try {
        return await limit(8_000, () => treeIdle(api.client, sessionID))
      } catch {
        return false
      }
    },
    timer: opts.timer,
  })

  const cache = (sessionID: string, parentID?: string) => {
    if (!parentID) {
      root.set(sessionID, sessionID)
      return sessionID
    }

    const hit = root.get(parentID)
    if (!hit) return undefined
    root.set(sessionID, hit)
    return hit
  }

  const find = async (sessionID: string) => {
    const hit = root.get(sessionID)
    if (hit) return hit

    const chain = [sessionID]
    let cur = sessionID

    while (true) {
      const seen = root.get(cur)
      if (seen) {
        chain.forEach((item) => {
          root.set(item, seen)
        })
        return seen
      }

      const info = (
        await api.client.session.get(
          { sessionID: cur },
          {
            throwOnError: true,
          },
        )
      ).data
      if (!info?.parentID) {
        chain.forEach((item) => {
          root.set(item, cur)
        })
        root.set(cur, cur)
        return cur
      }

      chain.push(info.parentID)
      cur = info.parentID
    }
  }

  const sync = async (sessionID: string) => {
    const rootID = await find(sessionID)
    const info = await stats(api.client, rootID)
    eng.setActiveCount(rootID, info.active_count)
    return { rootID, active_count: info.active_count }
  }

  const aborted = (value: unknown) => {
    if (!value || typeof value !== "object") return false
    if (!("error" in value)) return false
    const err = value.error
    if (!err || typeof err !== "object") return false
    if (!("name" in err)) return false
    return err.name === "MessageAbortedError"
  }

  const rebinding = () => {
    off()
    off = api.command.register(cmds)
  }

  const pin = (sessionID?: string) => {
    if (!sessionID) return
    if (head === sessionID) return
    head = sessionID
    rebinding()
  }

  const follow = async (sessionID?: string) => {
    pin(sessionID)
    if (!sessionID) return
    const rootID = await find(sessionID)
    root.set(sessionID, rootID)
    const info = await sync(sessionID)
    if (!live) {
      setRev((value) => value + 1)
      return
    }

    if (rootID === live) {
      if (info.active_count > 0) eng.onBusy(info.rootID)
      if (info.active_count < 1) await eng.onIdle(info.rootID)
      setRev((value) => value + 1)
      return
    }

    eng.disable(live)
    eng.enable(rootID)
    live = rootID

    const status = api.state.session.status(rootID)
    const active = status?.type === "busy" || status?.type === "retry"
    if (!active) eng.pause(rootID, "start")

    if (info.active_count > 0) eng.onBusy(info.rootID)
    setRev((value) => value + 1)
  }

  const read = (sessionID: string, part: Part) => {
    const hit = role.get(part.messageID)
    if (hit) return hit
    return api.state.session.messages(sessionID).find((item) => item.id === part.messageID)?.role
  }

  const run = async (sessionID: string, fn: (root: string) => void | Promise<void>) => {
    try {
      const info = await sync(sessionID)
      const hit = eng.entry(info.rootID)
      if (hit?.enabled && hit.paused && hit.pause_reason === "start" && info.active_count > 0) {
        eng.onBusy(info.rootID)
      }
      await fn(info.rootID)
    } catch {
      return
    }
    setRev((value) => value + 1)
  }

  const cmds = () => {
    rev()
    const sessionID = current(api)
    const rootID = sessionID ? (root.get(sessionID) ?? sessionID) : undefined

    return [
      {
        title: rootID ? eng.title(rootID) : "Auto-Working: Enable",
        value: "auto-working.toggle",
        category: "Session",
        suggested: true,
        hidden: api.route.current.name !== "session",
        async onSelect() {
          const sessionID = current(api)
          if (!sessionID) return
          pin(sessionID)
          const rootID = await find(sessionID)
          root.set(sessionID, rootID)

          if (eng.entry(rootID)?.enabled) {
            eng.disable(rootID)
            if (live === rootID) live = undefined
            setRev((value) => value + 1)
            api.ui.dialog.clear()
            api.ui.toast({ variant: "info", message: "Auto-Working 已关闭" })
            return
          }

          eng.enable(rootID)
          live = rootID
          const status = api.state.session.status(rootID)
          const active = status?.type === "busy" || status?.type === "retry"
          if (!active) eng.pause(rootID, "start")
          setRev((value) => value + 1)
          api.ui.dialog.clear()
          api.ui.toast({ variant: "success", message: "Auto-Working 已开启" })

          void sync(sessionID)
            .then((info) => {
              if (info.active_count > 0) eng.onBusy(info.rootID)
              setRev((value) => value + 1)
            })
            .catch((error) => {
              eng.disable(rootID)
              setRev((value) => value + 1)
              api.ui.toast({
                variant: "error",
                message: `Auto-Working 启动失败: ${error instanceof Error ? error.message : String(error)}`,
              })
            })
        },
      },
    ]
  }

  let off = api.command.register(cmds)
  queueMicrotask(() => {
    rebinding()
  })

  api.event.on("session.created", (event) => {
    cache(event.properties.sessionID, event.properties.info.parentID)
    setRev((value) => value + 1)
  })

  api.event.on("session.updated", (event) => {
    cache(event.properties.sessionID, event.properties.info.parentID)
    setRev((value) => value + 1)
  })

  api.event.on("session.deleted", (event) => {
    root.delete(event.properties.sessionID)
    setRev((value) => value + 1)
  })

  api.event.on("session.status", (event) => {
    if (event.properties.status.type === "idle") {
      return run(event.properties.sessionID, (rootID) => eng.onIdle(rootID))
    }

    if (event.properties.status.type !== "busy" && event.properties.status.type !== "retry") return
    return run(event.properties.sessionID, (rootID) => eng.onBusy(rootID))
  })

  api.event.on("session.idle", (event) => {
    return run(event.properties.sessionID, (rootID) => eng.onIdle(rootID))
  })

  api.event.on("tui.command.execute", (event) => {
    if (event.properties.command !== "session.interrupt") return
    const sessionID = current(api)
    if (!sessionID) return
    return run(sessionID, (rootID) => eng.pause(rootID, "interrupt"))
  })

  api.event.on("message.updated", (event) => {
    role.set(event.properties.info.id, event.properties.info.role)
    if (event.properties.info.role !== "assistant") return
    if (aborted(event.properties.info)) {
      return run(event.properties.sessionID, (rootID) => eng.pause(rootID, "interrupt"))
    }
    if (paused.has(event.properties.info.id)) return
    return run(event.properties.sessionID, (rootID) => eng.onAssistant(rootID))
  })

  api.event.on("message.removed", (event) => {
    role.delete(event.properties.messageID)
    paused.delete(event.properties.messageID)
    setRev((value) => value + 1)
  })

  api.event.on("message.part.updated", (event) => {
    if (event.properties.part.type !== "text") return
    if (event.properties.part.synthetic || event.properties.part.ignored) return

    const hit = read(event.properties.sessionID, event.properties.part)
    if (hit === "assistant") {
      if (hasWaitingMarker(event.properties.part.text)) {
        paused.add(event.properties.part.messageID)
        return run(event.properties.sessionID, (rootID) => eng.pause(rootID, "user"))
      }
      if (hasCompleteMarker(event.properties.part.text)) {
        paused.add(event.properties.part.messageID)
        return run(event.properties.sessionID, (rootID) => eng.pause(rootID, "complete"))
      }
      return
    }

    if (hit !== "user") return
    if (isHeartbeatText(event.properties.part.text.trim())) return
    return run(event.properties.sessionID, (rootID) => eng.onManual(rootID))
  })

  return { eng, root, rev, follow }
}
