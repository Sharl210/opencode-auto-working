import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui"
import { createMemo, createSignal, onCleanup } from "solid-js"
import type { Engine } from "./engine.js"
import { current, setup } from "./runtime.js"

const id = "opencode:auto-working"

function View(props: { api: TuiPluginApi; eng: Engine; root: Map<string, string> }) {
  const [tick, setTick] = createSignal(0)
  const timer = setInterval(() => {
    const sessionID = current(props.api)
    if (!sessionID) return
    const rootID = props.root.get(sessionID) ?? sessionID
    props.eng.tick(rootID)
    setTick((value) => value + 1)
  }, 1000)

  onCleanup(() => {
    clearInterval(timer)
  })

  const text = createMemo(() => {
    tick()
    const sessionID = current(props.api)
    if (!sessionID) return ""
    return props.eng.badge(props.root.get(sessionID) ?? sessionID)
  })

  if (!text().length) return undefined
  return <box paddingLeft={1}><text fg={props.api.theme.current.success}>{text()}</text></box>
}

const tui: TuiPlugin = async (api) => {
  const { eng, root, rev } = await setup(api)

  api.slots.register({
    order: 100,
    slots: {
      app() {
        rev()
        return <View api={api} eng={eng} root={root} />
      },
    },
  })
}

const plugin: TuiPluginModule & { id: string } = {
  id,
  tui,
}

export default plugin
