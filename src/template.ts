export const MARK = "[[AUTO_WORKING_HEARTBEAT]]"
export const WAITING_MARK = "[[AUTO_WORKING_WAITING_FOR_USER]]"
export const COMPLETE_MARK = "[[AUTO_WORKING_TASK_COMPLETE]]"

const HEAD = "────────── AUTO-WORKING HEARTBEAT BEGIN ──────────"
const TAIL = "────────── AUTO-WORKING HEARTBEAT END ──────────"

export function heartbeatText() {
  return [
    HEAD,
    MARK,
    "[Auto-Working 插件提示]",
    "以下内容由 Auto-Working 插件以用户消息身份自动代发。",
    "这不是用户刚刚手动输入的新消息，请与用户真实输入区分处理。",
    "",
    "[Auto-Working 代发内容]",
    "继续。",
    "如果当前正在向用户提供多个可选方案，请直接采用最推荐的方案继续执行。",
    "除非确实已经无法继续自主推进，否则请不要输出下面的暂停标识。",
    `如果当前步骤必须由用户本人做出无法替代的决定，请不要继续自动推进，并在回复中原样输出标识 \`${WAITING_MARK}\`。`,
    `如果当前任务已经全部完成、没有合理的后续拓展，或者继续执行会进入高风险操作，请不要继续自动推进，并在回复中原样输出标识 \`${COMPLETE_MARK}\`。`,
    "",
    "[Auto-Working 目的说明]",
    "本条消息是插件自动发送的心跳包，用于督促持续自主推进。",
    TAIL,
  ].join("\n")
}

export function isHeartbeatText(text: string) {
  return text.startsWith(`${HEAD}\n${MARK}`)
}

export function hasWaitingMarker(text: string) {
  return text.includes(WAITING_MARK)
}

export function hasCompleteMarker(text: string) {
  return text.includes(COMPLETE_MARK)
}
