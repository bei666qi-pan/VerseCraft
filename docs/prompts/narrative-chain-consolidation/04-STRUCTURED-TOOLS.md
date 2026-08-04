# Phase 4：Function Calling 与结构化输出治理

## 使命

让玩法相关结构变化通过受限领域 Function Calling 表达意图，并由服务端领域规则生成权威 StateDelta；同时收紧 Writer、Actor 和 Director 的结构化输出契约。

Function Calling 是命令接口，不是正确性证明。JSON Schema 是形状约束，不是业务授权。最终正确性仍来自 domain service、validator、resolve 和 commit。

## OpenSpec

优先继续阶段 1 的 `integrate-bounded-dm-agent-tools`，只为尚未完成的工具治理补充 tasks/specs。若本阶段要引入跨 Writer/Director 的统一 schema 基础设施，且明显超出该 change，创建窄 change，不要混入 Actor Simulation 行为。

## 工具分类

### 可保留或扩展的窄工具

- 玩家/背包/任务/场景/战斗状态只读查询。
- `issue_quest`、`update_quest_progress`。
- `inspect_forge_options`、`forge_weapon`。
- `start_combat`、`resolve_combat_action`。
- `consume_materials`、`grant_registered_item`。
- 经过登记和验证的有限 world event candidate。

### 永远禁止的万能工具

- `set_game_state`
- `apply_arbitrary_delta`
- `write_any_field`
- `invent_item`
- `grant_any_reward`
- `write_world_truth`
- `impersonate_npc_knowledge`
- `commit_final_turn`
- `emit_final_sse`

如果已有类似万能工具，必须收窄、隔离为只读/候选，或删除生产暴露面。

## Function Calling 设计要求

每个写工具必须拥有：

- `additionalProperties:false` 参数 schema。
- 明确 required、enum、长度和数量上限。
- 服务端运行时参数验证，不能只信 provider schema。
- session/user/world/location 权限边界。
- 领域前置条件。
- 注册表校验。
- request-scoped idempotency key。
- 原子性或失败零写入保证。
- 稳定错误码与可恢复提示。
- per-tool timeout 和 AbortSignal。
- 不含私有状态的审计 trace。

模型参数只描述“想执行什么”，不能传入最终伤害、奖励数值或成功结论。数值必须由 handler 调用的领域服务计算。

## 结构化结果链

推荐边界：

```text
ToolCall arguments
→ schema validation
→ permission/prerequisite checks
→ domain service
→ ToolResult
→ typed StateDelta candidate
→ merge into DM candidate
→ guards/validators
→ resolveDmTurn
→ commitTurn
```

Tool handler 不能直接操作客户端 Zustand store。若必须持久化服务端 side effect，应设计幂等事务边界，并确保最终 turn 不会再次双写同一效果。

## Writer/Actor/Director 输出约束

使用 `RUNTIME-PROMPTS.md` 中的模板，但根据真实 provider 能力选择：

1. Function Calling 提交结构化参数；或
2. `response_format: json_schema`；或
3. JSON object + 下游严格 parser/validator 降级。

所有要求 JSON 的 system prompt 必须包含字面量：

```text
请严格以 JSON 格式输出
```

### strict JSON Schema

当前 PLAYER DM schema 若仍为 `strict:false`，不得简单把开关改为 true。启用前必须：

- 与权威 TypeScript DM 类型逐字段核对。
- 所有对象层满足目标 provider 的 strict 规则。
- 所有可选字段按 nullable/required 规则正确建模。
- 嵌套数组和 reward/task/item 结构无字段丢失。
- 真实 one-api 后端和目标模型完成 compatibility probe。
- 4xx/unsupported 时能关闭 feature flag 或安全回退。

如果无法证明兼容，本阶段可以保持 PLAYER DM schema 非 strict，同时优先把 mechanics 写操作迁入窄工具并加强 downstream validator。不得为了“看起来更严格”破坏合法字段。

### 最终 envelope

- Writer draft、tool result、DirectorPlan 都只是候选。
- 服务端组装最终 envelope。
- 模型不得自行输出完整权威 StateDelta 并绕过 handler。
- 最终 SSE FINAL 继续由唯一服务端阶段产生。

## 工具轮次与并发

- tool loop 有固定轮数和 hard cap。
- 最后一轮强制不再调用工具并收口，或由服务端直接完成候选组装。
- 每轮只读调用可并行。
- 每轮最多一个会改变同一状态域的写调用；跨域写调用也必须有明确顺序和原子性设计。
- 不允许模型在失败后无上限重复同一工具。
- tool result 字符数受限，避免把完整 store/world dump 回灌模型。

## 测试要求

每个工具至少覆盖：

- schema 正例。
- 缺 required。
- additional property。
- 错误 enum/type。
- 未注册目标。
- 位置/资源/权限不足。
- Abort/timeout。
- handler throw。
- 重放幂等。
- 原子失败零写入。

全局覆盖：

- provider wire format 的 `tools/tool_choice/tool_calls/tool_call_id`。
- 上行消息剥离 `reasoning_content` 但保留合法 tool linkage。
- tool result 不进入 response cache。
- 无工具 provider/模型的安全回退。
- schema flag off 行为兼容。
- 玩家结构字段不会因 strict/schema 漂移丢失。

## 最低验证

```bash
pnpm exec tsx --test src/lib/ai/gateway/*.test.ts
pnpm exec tsx --test src/lib/ai/stream/*.test.ts
pnpm exec tsx --test src/lib/ai/tools/*.test.ts
pnpm exec tsx --test src/lib/ai/schemas/*.test.ts
pnpm test:e2e:chat
pnpm test:e2e:contract
pnpm benchmark:game-mechanics
npx eslint .
```

如启用 strict schema，必须额外运行真实 gateway probe 和 live contract；缺少安全环境则保持 flag 默认关闭。

## 阶段完成定义

- 生产暴露工具全部是窄领域工具。
- 写工具由服务端计算结果并具有验证、幂等、原子性和预算。
- 不存在万能 StateDelta/FINAL 工具。
- Writer/Actor/Director 候选结构有 parser 和 validator。
- strict schema 只在真实兼容证据存在时启用，否则安全保持关闭。
- 工具、gateway、stream、contract 和 mechanics benchmark 通过。

