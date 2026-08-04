# Phase 3：后台选角、NPC 行动推演与导演汇总

## 使命

在现有 background World Director 上增加有界的 NPC 行动推演能力：从当前重要 NPC 中选择少量角色，按各自认知边界推演行动候选，再由 Director 汇总为兼容现有 `director_plan_v1` 的 agenda。

这是后台工作流，不是在线多 Agent 协商系统。

## OpenSpec

使用 `openspec-propose` 或更新一个专门的 world director change。建议能力名：

```text
add-bounded-director-actor-simulation
```

必须写清：

- 不进入 `/api/chat` 等待路径。
- 不改数据库 schema 的优先方案。
- 与现有 Social World、NpcAgentState、DirectorPlan 的复用关系。
- shadow → soft 的灰度策略。
- 成本、并发、超时、部分失败和去重策略。

## 必读代码

- `src/lib/worldEngine/engine.ts`
- `src/lib/worldEngine/contracts.ts`
- `src/lib/worldEngine/config.ts`
- `src/lib/worldEngine/validator.ts`
- `src/lib/worldEngine/directorTools.ts`
- `src/lib/worldEngine/agenda.ts`
- `src/lib/socialWorld/activation.ts`
- `src/lib/socialWorld/types.ts`
- `src/lib/socialWorld/state.ts`
- `src/lib/socialWorld/validator.ts`
- `src/lib/epistemic/**`
- `src/lib/turnEngine/epistemic/**`
- `scripts/vc-worker.ts`
- `scripts/eval-director.ts`
- `scripts/eval-social-world.ts`

## 推荐工作流

```text
WORLD_ENGINE_TICK
→ load current world/director/social state
→ deterministic cast selection
→ build actor-scoped simulation inputs
→ bounded actor simulation
→ deterministic pre-validation
→ director synthesis
→ existing parseWorldEngineDeltaJson
→ validateDirectorPlan + social validator
→ existing persistence and agenda injection
```

### Cast Selection

- 复用 `selectActiveNpcsForSocialTick()` 或在其上增加可测试的窄适配层。
- 不建立第二套 NPC relevance 评分真相源。
- 默认最多 3 个 NPC；硬上限不超过现有 social world budget。
- 无必要角色时允许零模拟，直接执行现有 director path。
- 选角阶段优先为确定性纯函数，不增加一个 LLM router 调用。

### Actor Simulation

每个 Actor 输入只能包含：

- 该 NPC 的 currentGoal/currentFear/currentNeed。
- 该 NPC 的 knownFactIds、suspectedFactIds、forbiddenRevealIds。
- 允许看见的 relation edges、当前位置、个人 agenda。
- scene public 与 actor scoped facts。
- 有限的回合 horizon，默认 1～3 回合。

禁止提供：

- 全量 dmOnly 世界真相。
- 其他 NPC 私有记忆。
- 玩家私有事实，除非该 NPC 已合法获知。
- 无 factId/source/revealTier 的关键剧情真相。

Actor 输出只是候选，不得直接写数据库、StateDelta、agenda 或玩家叙事。

### 第一版执行策略

默认优先一次批量 `STORYLINE_SIMULATION` 调用，同时产生最多 3 个 ActorProjection。原因是成本、延迟和一致性更可控。

独立并行 fan-out 只能作为默认关闭的 shadow 实验：

- Feature flag 独立控制。
- `Promise.allSettled`，不能因一个 Actor 失败而丢弃整轮。
- 每 Actor 超时、总 tick wall-clock budget、最大调用数和最大 token 明确受限。
- 不共享可变 transcript。
- 结果按 npcId 和 simulationId 去重。
- shadow 阶段只比较质量/延迟，不影响正式 agenda。

### Director Synthesis

- Director 可以接收多个 ActorProjection，但必须保留每项 `knownFactIdsUsed` 和来源。
- 冲突处理必须显式：同地点冲突、互斥行动、重复事件、双方知识不对称。
- 只接受可撤销、可拒绝、保留玩家自主性的事件。
- 最终输出继续适配 `director_plan_v1`；优先通过内部 adapter，不直接破坏持久化 schema。
- Actor 的候选文字不能直接进入 `injection_hint`。必须经过提炼和 must-not-reveal 检查。

## 类型契约

至少定义并测试等价的纯类型：

```text
DirectorCastPlan
ActorSimulationInput
ActorProjection
ActorProjectionIssue
DirectorSynthesisInput
DirectorSimulationTelemetry
```

具体字段以 `RUNTIME-PROMPTS.md` 为起点，但必须根据现有 types 和 validator 收敛，避免重复定义同义字段。

## Validator 要求

新增 validator 必须是纯函数，不访问数据库、文件、网络或 LLM。至少检查：

- actor id 是否注册。
- `knownFactIdsUsed` 是否为该 actor 可知。
- mustNotReveal 是否出现在摘要或 injection hint。
- actor location 与行动目标是否可达/可信。
- Actor 是否决定了玩家动作或强制玩家失败。
- rumor/hypothesis/false belief 是否被写成确定事实。
- 多个 Actor 是否产生互斥 commit。
- Projection 是否缺少来源、越过 reveal tier 或使用 dmOnly fact。

高风险候选丢弃；允许安全的剩余候选继续汇总。不要因一条坏候选让整个 world tick 永久不产 agenda。

## Telemetry

至少记录：

- castCandidateCount / castSelectedCount。
- simulationMode：off/batch/shadow_parallel/soft_parallel。
- simulationRequested/fulfilled/rejected/timedOut。
- projectionAccepted/rejectedByCode。
- actorSimulationLatencyMs / synthesisLatencyMs / totalTickLatencyMs。
- token/cost（沿用现有 AI telemetry，不新增平行账本）。
- agenda accepted/rejected 数量。

不得在 telemetry 中存储完整私有 prompt、hidden truth 或原始玩家隐私文本。

## 灰度与回滚

新增 `VERSECRAFT_ENABLE_*` 或现有风格的独立开关，至少支持：

- simulation 完全关闭，回到原 World Director。
- batch shadow：生成但不影响 agenda。
- batch soft：允许安全 projection 参与 synthesis。
- parallel shadow：只做比较，不提交。

关闭 Actor Simulation 不得停止原 world tick、agenda 或 social world。

## 测试与 Eval

必须覆盖：

1. 无候选 NPC。
2. 一个主要 NPC。
3. 三 NPC 知识互斥。
4. 一个 Actor 超时、其余成功。
5. 全部 Actor 失败，回退原 director。
6. 私有知识泄漏候选被拒绝。
7. rumor 被错误确定化时拒绝或降级。
8. 强制玩家失败候选被拒绝。
9. 同地点互斥行动冲突解决。
10. 重复 simulation/job 幂等。
11. flag off 行为与旧 director 一致。
12. 结果仍能被 `parseWorldEngineDeltaJson` 和 `validateDirectorPlan` 接受。

增加 golden scenes，但不得引用外部小说原文。

## 最低验证

```bash
pnpm exec tsx --test src/lib/worldEngine/*.test.ts
pnpm exec tsx --test src/lib/socialWorld/*.test.ts
pnpm exec tsx --test src/lib/turnEngine/epistemic/*.test.ts
pnpm eval:director
pnpm eval:social-world
npx eslint .
```

真实网关验证仅在配置存在且安全时运行 `pnpm probe:director:live`；缺少环境时明确记录，不伪造。

## 阶段完成定义

- Actor Simulation 仅在 worker/background path。
- 选角复用现有 scorer，默认最多 3 个。
- Actor 输入经过 actor-scoped epistemic filtering。
- 默认 batch、有界预算；parallel 仅在独立 flag 下 shadow。
- Projection 经纯 validator 后才能进入 synthesis。
- 输出兼容现有 DirectorPlan/persistence/agenda。
- flag off 能回到旧 director。
- unit、golden、director/social eval 通过并记录证据。

