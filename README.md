# Auto-Working

Auto-Working 是一个面向 OpenCode 的纯 TUI 插件，目标是在会话真正空闲后继续推动模型自主推进任务，并在需要用户介入或任务已完成时自动进入可识别的暂停态。

插件提供以下能力：

- 基于 `Ctrl+P` 命令菜单的 Auto-Working 开关
- 面向当前会话的运行状态 badge
- 递归感知根 session 与全部后代 session 的状态
- 心跳续跑、指数退避、暂停态识别与自动恢复
- 任务树数量与本次连续运行时长显示

## 设计思路

Auto-Working 采用纯插件实现，不修改 OpenCode 核心代码。内部结构拆分为三层：

1. **模板层**：定义心跳消息与暂停标识，保证插件与模型之间的控制信号明确、稳定、可识别。
2. **状态层**：维护每个 session 的启用状态、退避计时、暂停原因、任务树数量与连续运行时长。
3. **运行时层**：订阅 OpenCode TUI 事件，将根 session 与递归后代 session 的状态变化统一编排到状态机中。

这种拆分方式的重点不是增加抽象，而是保证插件可以在独立仓库中持续演进，并且在新增暂停态、控制信号或显示指标时不影响核心集成面。

## 安装方法

根据 OpenCode 当前插件机制，当前最稳妥的人工安装方式是直接安装最新 release 附件：

```bash
opencode plugin https://github.com/Sharl210/opencode-auto-working/releases/latest/download/opencode-auto-working-latest.tgz
```

或使用等价别名：

```bash
opencode plug https://github.com/Sharl210/opencode-auto-working/releases/latest/download/opencode-auto-working-latest.tgz
```

说明：

- OpenCode 会读取插件包 `package.json` 中的 `oc-plugin` 字段识别目标类型。
- 本插件面向 TUI 使用场景。
- 这套安装方式已经按 GitHub Release 直链做过实际验证。
- 当前 OpenCode 安装器在实测中会同时把该插件条目写入 `opencode.json` 与 `tui.json`。这是当前安装链路的实际行为，不是文档推测。
- 如需安装到全局配置，可使用：

```bash
opencode plugin https://github.com/Sharl210/opencode-auto-working/releases/latest/download/opencode-auto-working-latest.tgz --global
```

## 使用方法

安装完成后，插件会默认注入到侧边栏，但默认不会直接启动自动工作状态机。

在未启用时，界面会常驻显示两行：

- `Auto-Working: OFF`
- `进行中任务数: xxx`

此时只保留任务树数量统计，不会发送心跳，也不会处理暂停态或自动推进逻辑。

如果需要真正启动 Auto-Working，再在 OpenCode TUI 中通过 `Ctrl+P` 打开命令菜单，执行以下命令之一：

- `Auto-Working: Enable`
- `Auto-Working: Disable`

启用后，第一行会切换为 `Auto-Working: ON`，并进入完整的自动工作模式。此时插件会在界面中显示当前状态，包括：

- 等待用户开始工作：`Auto-Working ON · ∞ · 等待用户开始工作中...`
- 正常运行：`Auto-Working ON`
- 退避等待：`Auto-Working ON · 39s`
- 用户主动打断：`Auto-Working ON · ∞ · 用户主动打断中`
- 等待用户介入：`Auto-Working ON · ∞ · 等待用户介入`
- 任务已完成：`Auto-Working ON · ∞ · 任务已完成`

同时，badge 还会附带显示当前任务树数量与本次连续运行时长。

## 实现效果

Auto-Working 只会在以下条件同时满足时继续自动推进：

- 当前根 session 已回到 `idle`
- 全部后代 session 已回到 `idle`
- 当前不处于暂停态

如果用户在 session 仍未真正开始工作时先开启 Auto-Working，插件会先进入 `等待用户开始工作中...` 暂停态。只有当当前任务树先进入过一次工作状态，再重新回到 `idle`，插件才会从这个初始暂停态进入正常运行链路。

在一次自动推进之后，如果模型没有继续给出有效响应，插件会使用指数退避控制下一次续跑时机。若模型明确返回以下任一标识，则插件进入暂停态，而不是盲目继续推进：

- `[[AUTO_WORKING_WAITING_FOR_USER]]`
- `[[AUTO_WORKING_TASK_COMPLETE]]`

这使插件既能保持高自主性，也能在真正需要用户介入或已经完成任务时停止自动推进。

如果用户主动执行 interrupt，插件会进入 `用户主动打断中` 暂停态，并停止继续累计持续运行时间。直到下一次 session 真正回到 `idle`，该暂停态才会退出。

持续运行时间只会在 `运行态` 内累积。进入等待态或任意暂停态后，计时会停止增加，但不会清零。只有在用户显式关闭 Auto-Working 模式时，这个累计时间才会清零。

## 卸载插件的方法

OpenCode 当前没有外部插件的官方卸载命令，因此卸载方式是手动移除插件配置。

需要从以下文件中删除 Auto-Working 的插件条目：

- 全局服务端配置：`~/.config/opencode/opencode.json`
- 全局 TUI 配置：`~/.config/opencode/tui.json`

如果你是按本文档的 latest 链接安装的，需要删除这一条：

```json
"https://github.com/Sharl210/opencode-auto-working/releases/latest/download/opencode-auto-working-latest.tgz"
```

删除后，重启 OpenCode 即可生效。

## 开发与打包

```bash
bun test
bun run typecheck
bun run build
npm pack --dry-run
```

执行 `bun run build` 后会生成可发布产物，随后可通过 `npm pack` 或 GitHub Release 附件进行分发。

## 协议

本项目采用 MIT License。
