# 在线回合工作流

权威术语和边界见 `CONTEXT.md` 与 ADR-0001。HTTP 层只做认证、请求协议转换和 SSE 输出；在线业务逻辑统一由 `PlayerTurnWorkflow` 管理。

## 唯一主链

```text
玩家请求
  -> PlayerTurnWorkflow
  -> TurnLaneRouter
  -> Writer（普通回合一次调用）或 MechanicsWorkflow（最多两次调用、一个写工具）
  -> TurnCandidate + 可选 MechanicsReceipt
  -> TurnFinalizer
  -> 状态提交
  -> 唯一 FINAL
  -> 异步 WorldDirectorWorkflow
```

`TurnCandidate` 永远不是权威状态。只有 `TurnFinalizer` 可以规范化、执行认知/NPC/领域校验、提交状态和发布 FINAL。只有 `CommittedTurnReceipt` 可以进入后台 Director。

## 路由和预算

- `TurnLaneRouter` 先用确定性规则；只有歧义输入才允许使用带缓存、300ms 截止的 embedding 分类。
- 普通 narrative lane 最多一次生成模型调用。
- Writer 只通过唯一 `submit_narrative` 协议输出 `narrative/options/turn_mode/decision_required`；完整 DM JSON、状态字段和兼容性二次调用均不属于模型职责。
- Mechanics lane 最多两次生成调用、一个写工具、20 秒总预算；首轮无工具时直接使用其候选。
- Agent 或网关失败后不得启动第三次 Writer 调用。
- `AiInvocationBudget` 是调用次数、截止时间、输出 token 和可选人民币成本的统一权限边界。
- 首个具体叙事字符 p95 目标不超过 5 秒，单回合硬上限 8 秒；协议 JSON 字节不计作具体叙事。
- 选项维护由确定性投影完成，不启动模型补写，客户端和服务端硬上限均为 5 秒。

## SSE 契约

- `Content-Type: text/event-stream; charset=utf-8`
- 状态帧以 `__VERSECRAFT_STATUS__:` 开头。
- 每个可玩回合恰好一个 `__VERSECRAFT_FINAL__:<json>`。
- FINAL 至少包含 `is_action_legal`、`sanity_damage`、`narrative`、`is_death`，并由 Finalizer 补齐玩法字段。
- Director 入队只能发生在 FINAL 写出之后，且不得阻塞在线延迟。

## 存档兼容

当前只写 `chapterPacing`。旧存档中的 `storyDirector` 与 `incidentQueue` 只在读取时迁移，迁移后不再写旧字段。

## 验证入口

```bash
pnpm exec tsx --test src/lib/turnEngine/turnFinalizer.test.ts
pnpm exec tsx --test src/lib/turnEngine/mechanicsWorkflow.test.ts
pnpm exec tsx --test src/lib/turnEngine/turnLaneRouter.test.ts
pnpm test:e2e:contract
pnpm benchmark:chat:mock
```

关键断言包括：普通与 Mechanics 恰好一个 FINAL、写工具幂等且失败无半提交、无第三次模型调用、双世界作用域隔离、旧存档无损迁移。
