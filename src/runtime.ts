import type { TuiPluginApi } from "@opencode-ai/plugin/tui"
import type { Message, Part } from "@opencode-ai/sdk/v2"
import { Engine } from "./engine.js"
import { descendants, treeIdle } from "./probe.js"
import { hasCompleteMarker, hasWaitingMarker, isHeartbeatText } from "./template.js"

export function current(api: TuiPluginApi): string | undefined {
  const route = api.route.current
  if (route.name !== "session") return undefined
  return typeof route.params?.sessionID === "string" ? route.params.sessionID : undefined
}

export async function setup(api: TuiPluginApi) {
  const root = new Map<string, string>()
  const role = new Map<string, Message["role"]>()
  const paused = new Set<string>()
  const eng = new Engine({
    send: async (sessionID, text) => {
      await api.client.session.prompt({
        sessionID,
        parts: [{ type: "text", text }],
      })
    },
    idle: async (sessionID) => treeIdle(api.client, sessionID),
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

      const info = (await api.client.session.get({ sessionID: cur })).data
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
    const list = await descendants(api.client, rootID)
    eng.setTaskCount(rootID, list.length + 1)
    return rootID
  }

  const read = (sessionID: string, part: Part) => {
    const hit = role.get(part.messageID)
    if (hit) return hit
    return api.state.session.messages(sessionID).find((item) => item.id === part.messageID)?.role
  }

  const run = async (sessionID: string, fn: (root: string) => void | Promise<void>) => {
    await fn(await sync(sessionID))
  }

  api.command.register(() => [
    {
      get title() {
        const sessionID = current(api)
        if (!sessionID) return "Auto-Working: Enable"
        return eng.title(root.get(sessionID) ?? sessionID)
      },
      value: "auto-working.toggle",
      category: "System",
      get hidden() {
        return api.route.current.name !== "session"
      },
      async onSelect() {
        const sessionID = current(api)
        if (!sessionID) return
        await run(sessionID, (rootID) => {
          if (eng.entry(rootID)?.enabled) {
            eng.disable(rootID)
            return
          }
          eng.enable(rootID)
        })
        api.ui.dialog.clear()
      },
    },
  ])

  api.event.on("session.created", (event) => {
    cache(event.properties.sessionID, event.properties.info.parentID)
  })

  api.event.on("session.updated", (event) => {
    cache(event.properties.sessionID, event.properties.info.parentID)
  })

  api.event.on("session.deleted", (event) => {
    root.delete(event.properties.sessionID)
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

  api.event.on("message.updated", (event) => {
    role.set(event.properties.info.id, event.properties.info.role)
    if (event.properties.info.role !== "assistant") return
    if (paused.has(event.properties.info.id)) return
    return run(event.properties.sessionID, (rootID) => eng.onAssistant(rootID))
  })

  api.event.on("message.removed", (event) => {
    role.delete(event.properties.messageID)
    paused.delete(event.properties.messageID)
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

  return { eng, root }
}
