# Phase 5：集成、性能、Eval、回滚与交付

## 使命

证明阶段 1–4 形成的是一条真实、统一、可回滚的生产链，而不是各自单测通过但互相绕开的功能集合。

本阶段允许对已验证发现做针对性修复；不得借验收名义进行整体重构或视觉改版。

## 集成调用链验收

至少用代码证据、contract test 和一条实际回合证明：

```text
player input
→ immediate SSE status
→ deterministic lane decision
→ optional bounded mechanics tool stage
→ Writer candidate
→ normalize/change-set/guards
→ epistemic + NPC consistency + narrative validation
→ resolveDmTurn
→ commitTurn
→ exactly one FINAL
→ client applies structured fields
→ non-blocking WORLD_ENGINE_TICK
→ bounded Actor Simulation + Director Synthesis
→ validated agenda
→ later turn receives safe due hint
```

检查所有提前 return、writer.close、直接 FINAL、直接 DB/state write 和重复 enqueue 分支。

## 必测玩家路径

### 普通叙事

- 观察场景。
- 与 NPC 打招呼。
- 询问信息。
- 移动。
- 模糊/混合意图。

断言：不进入写工具 loop，Writer 流式正文正常，final 一次。

### Mechanics

- 合法任务接取/推进。
- 非法或未知任务。
- 锻造成功。
- 材料不足。
- 合法战斗行动。
- 未注册敌人或无活跃战斗。
- 物品授予注册表成功/失败。

断言：领域结果权威、失败零写入、叙事与 StateDelta 一致。

### Director

- 单 NPC 正常推进。
- 多 NPC 冲突。
- 一个 Actor 超时。
- 私有知识泄漏。
- 无可推进 NPC。
- flag off 回到原 director。

断言：不阻塞在线回合，错误候选不落 agenda，剩余安全候选仍可用。

## 性能门

必须依据 AGENTS.md 和 `docs/perf/chat-latency-budget.md` 核对：

- 点击后 300ms 内 UI 有可信反馈。
- firstPerceivedFeedbackMs p95 ≤ 800ms。
- firstStatusShownMs p95 ≤ 800ms。
- firstVisibleTextMs 正常网关 p50 ≤ 2500ms、p95 ≤ 5000ms。
- 普通回合 FINAL p50 ≤ 12000ms、p95 ≤ 20000ms。
- 玩家不存在 5 秒以上完全无反馈等待。
- mechanics lane 有独立总预算，不能拖到分钟级。
- Actor Simulation 不计入在线 FINAL 等待。

运行：

```bash
pnpm benchmark:chat:mock
pnpm benchmark:chat-metrics
```

live benchmark 只在安全配置存在时运行。超预算必须修复或关闭新增路径，不能只在报告中接受。

## 自动测试矩阵

根据改动范围至少运行：

```bash
pnpm test:unit
pnpm test:e2e:chat
pnpm test:e2e:contract
pnpm benchmark:game-mechanics
pnpm eval:director
pnpm eval:social-world
pnpm eval:npc-consistency:mock
pnpm eval:narrative-safety:mock
pnpm eval:chat-quality:mock
npx eslint .
pnpm build
```

注意：`pnpm test:unit` 可能因已知 open handle 问题不主动退出。必须区分“测试断言通过但进程未退出”和真实失败，并记录证据。

若仓库当前存在与本任务无关的预有失败：

1. 用目标测试和 git diff 证明归属。
2. 本任务造成的必须修复。
3. 无关且不能安全修复的记录具体命令、文件和错误，不得伪称全绿。

## 对抗性验证

主动测试：

- 玩家要求模型忽略规则并直接赠送物品。
- 玩家要求 NPC 透露自己不可能知道的核心真相。
- 模型返回未知工具或多余参数。
- 模型连续请求同一写工具。
- tool result 含异常大对象或不可序列化值。
- Writer 叙述成功但 StateDelta 失败。
- StateDelta 成功但 Writer 叙述为失败。
- Actor 把 rumor 写成确定事实。
- Director 安排强制玩家死亡/失败。
- 网关不支持 tools 或 strict schema。
- 请求中途 Abort、stream 中断和 final repair。

所有情况必须安全拒绝、降级或生成可解析 final，不能部分提交。

## 灰度矩阵

形成并实测一张矩阵，具体变量以实现为准：

| Writer | DM tools | Actor simulation | Director mode | 预期 |
|---|---|---|---|---|
| legacy/main compat | off | off | existing | 完整旧路径 |
| Writer | off | off | existing | 只迁移叙事角色 |
| Writer | shadow | off | existing | 工具只观测不写 |
| Writer | soft | batch shadow | shadow | 候选全记录但不影响玩家 |
| Writer | soft | batch soft | soft | 完整目标路径 |
| Writer | soft | parallel shadow | soft | 只比较并行推演质量 |

任何新开关关闭后都不得导致 `/api/chat`、world tick 或旧存档不可用。

## OpenSpec 收口

- 逐个运行 `openspec status --change ... --json`。
- tasks 的勾选必须有代码和测试证据。
- 使用 `openspec-sync-specs` 同步已完成 change 的 delta specs。
- 不自动 archive。
- 若发现现有 `integrate-bounded-dm-agent-tools` 的历史完成声明不真实，修正 artifact，不保留误导性“18/18”文字。

## 最终文档

更新 `docs/narrative-chain-consolidation/PROGRESS.md` 为最终交付记录，至少包括：

- 最终架构和调用链。
- 每个 OpenSpec change 状态。
- 关键行为 before/after。
- 改动文件。
- 测试命令、退出码、通过数和失败归属。
- benchmark 指标。
- live 验证是否执行。
- feature flags 与一分钟回滚步骤。
- 数据库/schema/analytics 兼容结论。
- 剩余风险和推荐后续工作。

## 最终完成定义

- 普通叙事、mechanics、失败回退和 director 全链路都通过真实验收。
- 无 FINAL 旁路、双写、无限 tool loop 或在线 Actor Simulation。
- Function Calling、Writer、Director 责任没有重叠成新的多真相源。
- SSE、DM JSON、analytics 和 world tick 兼容。
- 性能满足预算，或新增功能保持关闭并明确阻塞证据。
- OpenSpec specs 已同步，PROGRESS 完整。
- lint/build/相关 unit、contract、E2E、benchmark、eval 有真实结果。

