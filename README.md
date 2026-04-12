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

### 1. 首选安装方式：让 LLM 代为安装

```text
仓库地址：https://github.com/Sharl210/opencode-auto-working
请在当前 OpenCode 环境中安装并启用 Auto-Working 插件。优先使用 OpenCode 官方插件安装命令，并直接安装这个 release 包：https://github.com/Sharl210/opencode-auto-working/releases/download/v0.1.2/opencode-auto-working-0.1.2.tgz
```

### 2. 人工安装方式

根据 OpenCode 当前插件机制，当前最稳妥的人工安装方式是直接安装 release 附件：

```bash
opencode plugin https://github.com/Sharl210/opencode-auto-working/releases/download/v0.1.2/opencode-auto-working-0.1.2.tgz
```

或使用等价别名：

```bash
opencode plug https://github.com/Sharl210/opencode-auto-working/releases/download/v0.1.2/opencode-auto-working-0.1.2.tgz
```

说明：

- OpenCode 会读取插件包 `package.json` 中的 `oc-plugin` 字段识别目标类型。
- 本插件面向 TUI 使用场景。
- 这套安装方式已经按 release 包做过实际验证。
- 当前 OpenCode 安装器在实测中会同时把该插件条目写入 `opencode.json` 与 `tui.json`。这是当前安装链路的实际行为，不是文档推测。
- 如需安装到全局配置，可使用：

```bash
opencode plugin https://github.com/Sharl210/opencode-auto-working/releases/download/v0.1.2/opencode-auto-working-0.1.2.tgz --global
```

## 使用方法

安装完成后，在 OpenCode TUI 中通过 `Ctrl+P` 打开命令菜单，执行以下命令之一：

- `Auto-Working: Enable`
- `Auto-Working: Disable`

启用后，插件会在界面中显示当前状态，包括：

- 正常运行：`Auto-Working ON`
- 退避等待：`Auto-Working ON · 39s`
- 等待用户介入：`Auto-Working ON · ∞ · 等待用户介入`
- 任务已完成：`Auto-Working ON · ∞ · 任务已完成`

同时，badge 还会附带显示当前任务树数量与本次连续运行时长。

## 实现效果

Auto-Working 只会在以下条件同时满足时继续自动推进：

- 当前根 session 已回到 `idle`
- 全部后代 session 已回到 `idle`
- 当前不处于暂停态

在一次自动推进之后，如果模型没有继续给出有效响应，插件会使用指数退避控制下一次续跑时机。若模型明确返回以下任一标识，则插件进入暂停态，而不是盲目继续推进：

- `[[AUTO_WORKING_WAITING_FOR_USER]]`
- `[[AUTO_WORKING_TASK_COMPLETE]]`

这使插件既能保持高自主性，也能在真正需要用户介入或已经完成任务时停止自动推进。

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
