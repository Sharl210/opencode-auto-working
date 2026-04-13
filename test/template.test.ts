import { expect, test } from "bun:test"
import {
  COMPLETE_MARK,
  MARK,
  WAITING_MARK,
  hasCompleteMarker,
  hasWaitingMarker,
  heartbeatText,
  isHeartbeatText,
} from "../src/template"

test("renders the wrapped plugin heartbeat", () => {
  const text = heartbeatText()

  expect(text).toContain(MARK)
  expect(text).toContain(WAITING_MARK)
  expect(text).toContain(COMPLETE_MARK)
  expect(text).toContain("[Auto-Working 插件提示]")
  expect(text).toContain("以下内容由 Auto-Working 插件以用户消息身份自动代发,请与用户真实输入区分处理。")
  expect(text).toContain(">>>>>请继续推进<<<<<")
  expect(text).toContain("工作日报输出给用户")
  expect(text).toContain("禁止输出下面的暂停标识")
  expect(isHeartbeatText(text)).toBe(true)
})

test("does not classify plain user text as heartbeat", () => {
  expect(isHeartbeatText("继续")).toBe(false)
})

test("detects the waiting-for-user marker", () => {
  expect(hasWaitingMarker(`before ${WAITING_MARK} after`)).toBe(true)
  expect(hasWaitingMarker("[[AUTO_WORKING_WAITING]]")).toBe(false)
})

test("detects the task-complete marker", () => {
  expect(hasCompleteMarker(`before ${COMPLETE_MARK} after`)).toBe(true)
  expect(hasCompleteMarker("[[AUTO_WORKING_TASK_DONE]]")).toBe(false)
})
