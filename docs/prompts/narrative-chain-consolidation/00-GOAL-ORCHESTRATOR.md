# Codex Goal 总控：叙事链路合并与后台导演升级

## 1. 身份与最终目标

你是 VerseCraft 本次架构升级的主负责人。你必须亲自完成理解、OpenSpec 规划、实现、测试、修复、复测和最终交付；不能把测试或集成责任留给未来会话。

最终产品架构必须满足：

> Writer 只负责“怎么写”；领域服务决定“本回合发生了什么”；后台 Director 决定“后续可能发生什么”；validator 与 commit pipeline 决定“哪些候选可以成为权威状态”。

目标不是建立一个自由协商的多 Agent 系统，而是在 VerseCraft 现有 Turn Compiler 与 background world tick 上实现一个可验证、有预算、有回滚开关的 staged workflow。

## 2. 启动时必须完整阅读

按顺序完整阅读：

1. 根 `AGENTS.md`。
2. 本目录 `README.md`。
3. 本目录 `01-STABILIZE-DM-AGENT.md` 至 `05-INTEGRATION-VALIDATION.md`。
4. 本目录 `RUNTIME-PROMPTS.md`。
5. `docs/turn-engine-architecture.md`、`docs/ai-architecture.md`、`docs/reasoner-world-director.md`。
6. `openspec/changes/integrate-bounded-dm-agent-tools/` 的全部现有 artifacts。
7. 当前真实代码路径，尤其是：
   - `src/app/api/chat/route.ts`
   - `src/lib/ai/models/logicalRoles.ts`
   - `src/lib/ai/tasks/taskPolicy.ts`
   - `src/lib/ai/logicalTasks.ts`
   - `src/lib/ai/router/execute.ts`
   - `src/lib/ai/tools/**`
   - `src/lib/playRealtime/normalizePlayerDmJson.ts`
   - `src/features/play/turnCommit/resolveDmTurn.ts`
   - `src/lib/turnEngine/commitTurn.ts`
   - `src/lib/turnEngine/validateNarrative.ts`
   - `src/lib/worldEngine/**`
   - `src/lib/socialWorld/**`

不要把本提示词中的代码现状描述当作永远正确。若描述与代码冲突，以当前代码为准，并在 `PROGRESS.md` 记录漂移和决策。

## 3. 已知高优先级审计点

启动后必须重新验证这些事实：

1. 当前 DM Agent feature flag 开启后，`route.ts` 是否对所有输入都尝试 Agent，而没有使用 `shouldAttemptDmAgent()`。
2. `runDmAgentTurn()` 在没有工具调用但返回普通正文时，是否仍把回合标记为 `agentUsed=true`。
3. DM Agent 命中后是否直接写 `__VERSECRAFT_FINAL__` 并关闭流，从而绕过正常 final hooks、NPC consistency、叙事 validator、显式 `commitTurn`、analytics 或 background tick。
4. `integrate-bounded-dm-agent-tools/tasks.md` 的完成声明，是否与 OpenSpec status、缺失 delta specs 和真实接线一致。
5. PLAYER DM JSON Schema 是否仍为 `strict:false`，目标网关是否真实支持 strict JSON Schema，而不仅是接受请求字段。
6. World Director 是否已经通过 `selectActiveNpcsForSocialTick()` 选择 NPC，以及哪些社会世界能力已经存在，避免建立第二套平行状态源。

任何一项已经被其他改动修复，都不要重做；用测试和调用链证据确认后标记为已满足。

## 4. OpenSpec 执行协议

本任务涉及 `/api/chat`、SSE/DM JSON、AI routing、prompt、post-generation validation 和 world tick，属于强制 OpenSpec 范围。

必须遵循：

1. 先运行 `openspec list --json`。
2. 阶段 1 优先使用 `openspec-update-change` 更新现有 `integrate-bounded-dm-agent-tools`，补齐真实 specs/tasks/验证记录，不新建重复 change。
3. Writer 迁移与后台导演升级如果超出现有 change 的原始能力边界，应分别使用 `openspec-propose` 创建小而清晰的 change；不要把整个项目塞进一个不可验证的 change。
4. 实施时使用 `openspec-apply-change`，每完成一项立即更新对应 tasks。
5. 行为完成且验证通过后使用 `openspec-sync-specs` 同步 delta specs。
6. 不自动归档 change；归档等待用户明确请求、PR 收口或单独归档流程。

如果 proposal 暴露出需要新的产品选择、外部权限、数据库迁移或明显扩大范围，停止相关阶段并请求用户决定。普通实现细节自行作出保守决策，不频繁打断用户。

## 5. 阶段依赖

严格按以下顺序推进：

```text
Phase 0 真实调用链审计与 OpenSpec 校准
    ↓
Phase 1 DM Agent / mechanics lane 收口
    ↓
Phase 2 Writer 能力层与兼容迁移
    ↓
Phase 3 后台 Actor Simulation / Director Synthesis
    ↓
Phase 4 Function Calling 与结构化输出治理补全
    ↓
Phase 5 集成、性能、eval、回滚与交付
```

阶段 1 没有通过“统一 final chain”门禁前，禁止继续增加 NPC Agent 或扩展 Writer 路由。

阶段 2 没有明确 Writer/control/reasoner 责任边界前，禁止让阶段 3 自行发明新模型角色。

阶段 3 默认只在 worker/background tick 运行。任何把 NPC simulation 放入 `/api/chat` 等待路径的方案都应被拒绝。

## 6. 工作区与 Git 安全

- 启动先运行 `git status --short`，记录已有 dirty files。
- 所有既有修改都视为用户资产。只编辑本阶段必要文件，编辑前重读最新内容。
- 禁止 `git reset --hard`、`git clean`、`git checkout --`、未经授权的 stash、批量回滚和覆盖。
- 不使用 `git add .` 或 `git add -A`。
- 未经用户明确授权，不创建提交、不 push、不建 PR、不部署。
- 不修改 `.env*` 中真实密钥，不在日志或报告中输出密钥、完整私有 prompt 或玩家隐私内容。

## 7. 大文件修改纪律

`src/app/api/chat/route.ts` 是最高风险大文件。对它新增行为前：

1. 画出当前输入、候选 DM record、final hooks、commit、FINAL 和 background tick 调用链。
2. 优先提取有明确输入输出的纯模块或 stage adapter。
3. `route.ts` 只保留必要接线，不把新 tool loop、Actor fan-out 或 schema 解析整段堆入其中。
4. 每次提取先证明无行为变化，再接入行为变化。

同样谨慎对待 `playerChatSystemPrompt.ts`、`useGameStore.ts`、`schema.ts`。本目标默认不需要修改数据库 schema 或客户端 store；如实际发现必须修改，先更新 proposal 和兼容计划。

## 8. 进度文件协议

启动后创建或续写：

```text
docs/narrative-chain-consolidation/PROGRESS.md
```

至少包含：

```text
goal
current_phase
openspec_changes
completed
in_progress
next
verified_facts
decisions
files_changed
tests_run_with_results
latency_evidence
blockers
rollback_flags
```

每个阶段结束立即更新。新会话先读它，再看 `git status`、OpenSpec status 和真实代码。不得仅凭 PROGRESS 声称完成；抽查关键测试和调用链。

## 9. 总体不变量

以下任何一条被破坏，都不得宣称目标完成：

- `/api/chat` 保持 `200 + text/event-stream` 契约，包括 `keys_missing` 降级。
- 保留 status 控制帧和 `__VERSECRAFT_FINAL__` 覆盖规则。
- 每回合最多一个权威 FINAL；Agent、Writer 和 validator 都不能自己提前提交 FINAL。
- 最终状态必须经过现有 normalize、guard、NPC consistency、post-generation validation、`resolveDmTurn`、`commitTurn` 链路。
- narrative 不是状态真相源；模型不能通过写故事获得物品、完成任务或改变关系。
- `PLAYER_CHAT` 不得进入 `reasoner`。
- control preflight 失败必须快速 fail-open，不能用更慢主模型补偿。
- world director、Actor Simulation 和推演全部留在 background worker。
- NPC 只能使用 actor-scoped 允许事实；不存在 `factId/source/revealTier` 的剧情真相不得 commit。
- Function Calling 参数合法不代表业务合法；所有写工具必须再经过服务端权限、前置条件、注册表、幂等和原子性校验。
- 不提供 `set_game_state`、`apply_arbitrary_delta`、`invent_item`、`commit_final_turn` 等万能写工具。
- 所有新能力必须有独立灰度开关，关闭后旧主链仍可运行。
- 不以增加重试或延长到分钟级换取表面成功率。

## 10. 子 Agent 使用边界

若当前 Codex 环境允许且用户已授权子 Agent/并行工作，可并行的仅包括：

- 只读调用链调查。
- 不同目录的测试覆盖分析。
- Actor Simulation 纯类型/纯 validator 与独立 eval fixture。
- 文档和 runtime prompt 审核。

不得并行让两个 Agent 修改：

- `src/app/api/chat/route.ts`
- `src/lib/ai/tasks/taskPolicy.ts`
- `src/lib/ai/config/envCore.ts`
- `src/lib/worldEngine/engine.ts`
- 同一个 OpenSpec artifact

主 Agent 必须亲自读取 applicable skill instructions、整合代码、运行最终门禁并更新 PROGRESS。

## 11. 停止与继续规则

- 不因一次测试失败、环境慢或代码复杂而提前停止。
- 同一阻塞连续出现三次且无法安全绕行时，记录完整证据，再按 Goal 模式规则报告 blocked。
- 需要真实网关但缺少密钥时，完成所有 mock、unit、contract 和静态验证；将 live 验证明确列为外部阻塞，不能伪造结果。
- 不问“是否继续”。只要下一阶段仍在授权范围且前置门通过，就继续。

## 12. 总完成定义

只有以下全部满足才算完成：

- 阶段 1–5 的独立完成定义全部满足。
- 普通叙事和模糊输入不会进入 mechanics tool loop。
- 明确 mechanics 回合不会绕过统一 final chain。
- Writer 是唯一玩家可见叙事责任主体；control 与 reasoner 仍隔离。
- 后台导演能有界选择、推演和汇总 NPC，同时保持 actor-scoped 认知。
- Function Calling 只表达受限领域命令，StateDelta 由服务端计算。
- SSE、DM JSON、analytics、world tick 和旧配置兼容测试通过。
- chat latency benchmark 没有超预算；若 live 环境超预算，已修复或明确回滚相关 flag。
- OpenSpec tasks 与真实实现一致，delta specs 已同步。
- PROGRESS 包含完整测试证据、回滚方式和未解决事项。
- 没有遗留绕过链路、万能工具、无限循环、静默吞错或无测试 TODO。

最终回答必须简洁列出：实现结果、OpenSpec changes、关键文件、测试与性能结果、灰度开关、未完成或外部阻塞。不要只罗列代码改了什么，要说明玩家与运行时行为最终如何变化。
