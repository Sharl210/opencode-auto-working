# Auto-Working

Auto-Working 是一个面向 OpenCode 的 TUI 插件。

它现在分成两层能力：

- **常驻显示层**：默认注入到侧边栏，始终显示开关状态和当前任务树中的进行中任务数。
- **自动工作层**：只有用户手动开启后才运行，负责心跳续跑、暂停态识别、自动恢复和退避等待。

这意味着插件安装后就能看到状态，但不会默认替你开始自动推进任务。

## 当前真实行为

### 默认状态

插件安装并加载后，默认就是 **OFF**。

在 **OFF** 状态下，侧边栏只显示两行：

- `Auto-Working: OFF`
- `进行中任务数: xxx`

此时插件只做任务树数量统计，不会：

- 发送心跳消息
- 进入暂停态状态机
- 自动推进任务
- 解析模型回复里的暂停标识
- 注入任何 Auto-Working 自动消息

### 手动开启后

用户在命令菜单中手动开启后，插件进入 **ON** 状态。

这时第一行会变成：

- `Auto-Working: ON`

并且会额外显示自动工作相关状态，例如：

- 当前状态
- 下一次重发倒计时
- 进行中任务数
- 本次模式持续运行时长

只有在 **ON** 状态下，自动工作状态机才会真正运行。

## 安装

推荐直接安装最新 release：

```bash
opencode plugin https://github.com/Sharl210/opencode-auto-working/releases/latest/download/opencode-auto-working-latest.tgz
```

或：

```bash
opencode plug https://github.com/Sharl210/opencode-auto-working/releases/latest/download/opencode-auto-working-latest.tgz
```

如果你希望写入全局配置：

```bash
opencode plugin https://github.com/Sharl210/opencode-auto-working/releases/latest/download/opencode-auto-working-latest.tgz --global
```

## 使用

安装完成后，打开 OpenCode TUI。

插件会默认注入到侧边栏，并先以 **OFF** 状态显示。

如果你要真正启动自动工作，再打开命令菜单执行：

- `Auto-Working: Enable`

开启后，如需停止自动工作，再执行：

- `Auto-Working: Disable`

## 自动工作层在 ON 状态下会做什么

当插件处于 **ON** 状态时：

这里的**会话树**，指的是：

- 当前主会话
- 这个主会话下面由模型或代理继续拉起的全部子会话
- 以及这些子会话继续往下产生的后代会话

也就是说，插件看的不是单独某一条当前消息，而是当前主会话向下展开后的整棵会话结构。

只有当这整棵会话树都回到空闲，Auto-Working 才会准备下一次自动推进。

上面显示的`进行中任务数`，统计的也是这整棵会话树里的进行中任务总数，不是某一个单独会话自己的数量。

1. 它会递归观察当前根会话和全部子会话。
2. 只有当整棵会话树重新回到空闲时，才会准备下一次续跑。
3. 第一次续跑前会先等待 5 秒。
4. 后续如果仍需要自动推进，会按退避时间继续等待再重发。

## 暂停态

插件内部会把暂停态细分成四种具体状态：

- `等待用户开始工作中`
- `用户主动打断中`
- `等待用户介入`
- `任务已完成`

## 模型回复里的控制标识

在 **ON** 状态下，插件会识别模型回复中是否包含以下标识：

- `[[AUTO_WORKING_WAITING_FOR_USER]]`
- `[[AUTO_WORKING_TASK_COMPLETE]]`

这里只要求 **包含** 该标识，不要求整段回复只等于该标识。

也就是说，模型前面可以先写解释文字，只要回复内容里包含上面的变量，插件就会识别并进入对应暂停态。

## 心跳消息

在 **ON** 状态下，如果整棵会话树空闲且不处于暂停态，插件会发送一条 Auto-Working 心跳消息来推动模型继续执行。

当前心跳消息的目标是：

- 优先继续推进任务
- 如果必须由用户本人决定，则输出 `[[AUTO_WORKING_WAITING_FOR_USER]]`
- 如果任务已经完成且没有合理后续，则输出 `[[AUTO_WORKING_TASK_COMPLETE]]`

## 卸载

OpenCode 当前没有单独的外部插件卸载命令。

如果你是按 release 直链安装的，需要从配置里删除这条插件地址：

```json
"https://github.com/Sharl210/opencode-auto-working/releases/latest/download/opencode-auto-working-latest.tgz"
```

常见位置：

- `~/.config/opencode/opencode.json`
- `~/.config/opencode/tui.json`

删除后重启 OpenCode 即可。

## 开发

```bash
bun test
bun run typecheck
bun run build
npm pack --dry-run
```

## License

MIT
