## Why

最近现场测评暴露出地点、冲突、伤害和理智状态可由 narrative 文本反向推断，以及未注册 NPC/物品进入结构化提交的问题。这违反 Turn Engine 的唯一裁决权威，并造成正文、最终状态和选项互相矛盾。

## What Changes

- 移除所有从 narrative 推断或回写地点、冲突、伤害、理智和死亡状态的路径。
- 只从玩家行动、当前权威状态和注册世界图解析最多一条相邻移动；支持“进入302”等确定性别名。
- 战斗、伤害和理智变化只接受验证后的结构化候选或已注册确定性机制结果；未落地于正文时进行一次有界 Writer-only 修复。
- 对所有结构化 NPC 标识执行世界/场景/会话权威校验；未注册人物不得提交关系、记忆、位置或图鉴状态。
- 对明确“使用某物”的玩家行动执行高置信度权威背包校验，拒绝不存在的物品且不误伤普通场景道具。
- 最终化阶段检查叙事、地点、死亡、物品、NPC 和选项一致性；只允许改写/降级正文，不允许正文改变已裁决事实。
- 将在线和 eval deadline 统一收敛到共享聊天性能预算，保持现有 SSE wire contract。

## Capabilities

### New Capabilities

- `authoritative-turn-consistency`: 定义叙事不得成为状态源，以及最终正文与已裁决状态的一致性边界。

### Modified Capabilities

- `turn-playability-guards`: 扩展相邻地点别名解析、明确物品使用校验和未注册人物提交门禁。
- `registered-combat-target-gate`: 要求冲突、伤害和理智变化具备结构化或已注册机制依据。
- `malformed-dm-repair-budget`: 将 narrative-only 修复纳入共享 final deadline，失败时使用可审计安全 fallback。

## Impact

- 影响 `/api/chat` finalization、`resolveDmTurn`、地点/实体/物品 guards、叙事 validator 和相关测试。
- SSE 继续使用 `text/event-stream`、`__VERSECRAFT_STATUS__` 与 `__VERSECRAFT_FINAL__`；DM 最低必需字段和客户端解析不变。
- 不修改数据库 schema、认证、analytics 事件名、主 store/snapshot schema 或公开 API。
- 首包路径不新增模型、DB 或 retrieval 调用；可选 Writer repair 仅位于生成后共享 deadline 内，超时返回协议合法的安全终帧。
- 新增治理开关沿用 `VERSECRAFT_ENABLE_*`；关闭后保留既有安全链和 wire contract，但 narrative-to-state 禁令不提供回退开关。
- 非目标：不重构 AI router/Director、不改变视觉 UI、不提交、推送或部署。
