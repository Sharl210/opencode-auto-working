import { RGBA } from "@opentui/core"
import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui"
import { createMemo, createSignal, For, onCleanup } from "solid-js"
import type { Engine } from "./engine.js"
import { durationParts, split } from "./format.js"
import { current, setup } from "./runtime.js"

const id = "opencode:auto-working"

function contrast(props: { api: TuiPluginApi }) {
  const c = props.api.theme.current.text
  const bg = props.api.theme.current.backgroundPanel
  const r = Math.round((1 - c.r) * 255)
  const g = Math.round((1 - c.g) * 255)
  const b = Math.round((1 - c.b) * 255)
  const dist = Math.abs(r - bg.r * 255) + Math.abs(g - bg.g * 255) + Math.abs(b - bg.b * 255)
  if (dist < 120) return props.api.theme.current.textMuted
  return RGBA.fromInts(r, g, b)
}

function lines(props: { api: TuiPluginApi; eng: Engine; root: Map<string, string>; follow: (sessionID?: string) => Promise<void> }) {
  const [tick, setTick] = createSignal(0)
  const timer = setInterval(() => {
    const sessionID = current(props.api)
    if (!sessionID) return
    void props.follow(sessionID).catch(() => {})
    const rootID = props.root.get(sessionID) ?? sessionID
    props.eng.tick(rootID)
    setTick((value) => value + 1)
  }, 1000)

  onCleanup(() => {
    clearInterval(timer)
  })

  const list = createMemo(() => {
    tick()
    const sessionID = current(props.api)
    if (!sessionID) return [] as string[]
    const rootID = props.root.get(sessionID) ?? sessionID
    return [
      props.eng.line1(rootID),
      props.eng.line2(rootID),
      props.eng.line3(rootID),
      props.eng.line4(rootID),
      props.eng.line5(rootID),
    ].filter(Boolean)
  })

  return { list }
}

function FooterView(props: { api: TuiPluginApi; eng: Engine; root: Map<string, string>; follow: (sessionID?: string) => Promise<void> }) {
  const line = lines(props)
  const fg = contrast(props)
  const plain = () => props.api.theme.current.text

  const duration = (text: string) => {
    if (text === "∞") return <text fg={plain()}>∞</text>
    return (
      <box flexDirection="row" flexWrap="wrap" alignItems="flex-start">
        <For each={durationParts(text) ?? []}>
          {(part) => (
            <box flexDirection="row" flexShrink={0}>
              <text fg={plain()}>{part.n}</text>
              <text fg={fg}>{part.u}</text>
              <text fg={plain()}> </text>
            </box>
          )}
        </For>
      </box>
    )
  }

  const row = (text: string) => {
    if (!text.length) return undefined
    const item = split(text)
    if (!item.value.length) return <text fg={fg}>{item.key}</text>
    return (
      <box flexDirection="row" flexWrap="wrap" width="100%" alignItems="flex-start">
        <text fg={fg}>{item.key}</text>
        {item.duration || item.value === "∞" ? duration(item.value) : <text fg={plain()} wrapMode="word">{item.value}</text>}
      </box>
    )
  }

  return (
    <box flexDirection="column" alignItems="flex-start" width="100%">
      <For each={line.list()}>{(item) => row(item)}</For>
    </box>
  )
}

const tui: TuiPlugin = async (api) => {
  const { eng, root, rev, follow } = await setup(api)

  api.slots.register({
    order: 0,
    slots: {
      sidebar_content() {
        rev()
        return <FooterView api={api} eng={eng} root={root} follow={follow} />
      },
    },
  })
}

const plugin: TuiPluginModule & { id: string } = {
  id,
  tui,
}

export default plugin
