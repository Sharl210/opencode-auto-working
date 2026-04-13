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
    "[Auto-Working 代发内容]",
    "以下内容由 Auto-Working 插件以用户消息身份自动代发,请与用户真实输入区分处理。",
    ">>>>>请继续推进<<<<<",
    "-如果当前正在向用户提供多个可选方案，请直接采用最推荐的方案继续执行。",
    "--除非确实已经无法继续自主推进，否则禁止输出下面的暂停标识！请再三确认！！！",
    `-如果当前步骤必须由用户本人做出无法替代的决定，请不要继续自动推进，并在回复中说出此次暂停的理由然后在末尾先换行一次单独一行原样输出标识 \`${WAITING_MARK}\`。`,
    `-如果当前任务已经全部完成且实在没有合理的后续拓展，或者再继续执行很大概率会进入高风险操作，那请不要继续自动推进，并在回复中说明你在自主推进期间所做的事情，写成工作日报输出给用户，并且在末尾先换行一次再单独一行原样输出标识 \`${COMPLETE_MARK}\`。`,
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
