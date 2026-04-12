import { expect, test } from "bun:test"
import { treeIdle } from "../src/probe"

test("requires the full descendant tree to be idle", async () => {
  const seen: string[] = []
  const client = {
    session: {
      children: async ({ sessionID }: { sessionID: string }) => {
        seen.push(sessionID)
        return {
          data:
            sessionID === "root"
              ? [{ id: "child" }]
              : sessionID === "child"
                ? [{ id: "leaf" }]
                : [],
        }
      },
      status: async () => ({
        data: {
          root: { type: "idle" },
          child: { type: "idle" },
          leaf: { type: "busy" },
        },
      }),
    },
  }

  expect(await treeIdle(client as never, "root")).toBe(false)
  expect(seen).toEqual(["root", "child", "leaf"])
})

test("treats unknown descendant status as not idle", async () => {
  const client = {
    session: {
      children: async ({ sessionID }: { sessionID: string }) => ({
        data: sessionID === "root" ? [{ id: "child" }] : [],
      }),
      status: async () => ({ data: { root: { type: "idle" } } }),
    },
  }

  expect(await treeIdle(client as never, "root")).toBe(false)
})

test("returns true when the full tree is idle", async () => {
  const client = {
    session: {
      children: async ({ sessionID }: { sessionID: string }) => ({
        data:
          sessionID === "root"
            ? [{ id: "child" }]
            : sessionID === "child"
              ? [{ id: "leaf" }]
              : [],
      }),
      status: async () => ({
        data: {
          root: { type: "idle" },
          child: { type: "idle" },
          leaf: { type: "idle" },
        },
      }),
    },
  }

  expect(await treeIdle(client as never, "root")).toBe(true)
})
