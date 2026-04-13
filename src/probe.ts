import type { TuiPluginApi } from "@opencode-ai/plugin/tui"
import type { SessionStatus } from "@opencode-ai/sdk/v2"

type Client = TuiPluginApi["client"]

type Query = {
  directory?: string
  workspace?: string
}

const active = (state?: SessionStatus) => state?.type === "busy" || state?.type === "retry"

export async function stats(client: Client, root: string, query: Query = {}) {
  const [list, status] = await Promise.all([descendants(client, root, query), client.session.status(query)])
  const map = status.data ?? {}
  const ids = [root, ...list]
  return {
    ids,
    active_count: ids.filter((id) => active(map[id])).length,
    idle: ids.every((id) => !active(map[id])),
  }
}

export async function descendants(client: Client, root: string, query: Query = {}) {
  const out: string[] = []

  const walk = async (id: string): Promise<void> => {
    const res = await client.session.children({ sessionID: id, ...query })
    const list = res.data ?? []
    out.push(...list.map((item) => item.id))
    await Promise.all(list.map((item) => walk(item.id)))
  }

  await walk(root)
  return out
}

export async function treeIdle(client: Client, root: string, query: Query = {}) {
  return (await stats(client, root, query)).idle
}
