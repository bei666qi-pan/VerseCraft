# Phase 1：收口 DM Agent 与 mechanics lane

## 使命

修复现有 DM Agent / Function Calling 的在线接线，使它只处理明确 mechanics intent，并把工具结果作为候选 StateDelta 重新汇入 VerseCraft 唯一的 Turn Compiler 提交链。

本阶段不是扩展更多工具，也不是重写 `/api/chat`。优先消除旁路、双重写入和普通叙事误路由。

## OpenSpec

优先使用 `openspec-update-change` 更新：

```text
integrate-bounded-dm-agent-tools
```

必须核对 proposal/design/tasks 中的“已完成”声明与真实代码。补齐缺失的 delta spec，明确 mechanics lane、统一 final chain、失败回退、延迟预算和回滚要求。

## 必读代码

- `src/app/api/chat/route.ts`
- `src/lib/ai/tools/dmAgentRouteIntegration.ts`
- `src/lib/ai/tools/dmAgentOrchestrator.ts`
- `src/lib/ai/tools/dmMechanicsIntentRouter.ts`
- `src/lib/ai/tools/dmAgentStateMerger.ts`
- `src/lib/ai/tools/dmToolHandlers.ts`
- `src/lib/ai/tools/gameDomainServices.ts`
- `src/lib/ai/tools/runToolLoop.ts`
- `src/lib/playRealtime/normalizePlayerDmJson.ts`
- `src/features/play/turnCommit/resolveDmTurn.ts`
- `src/lib/turnEngine/validateNarrative.ts`
- `src/lib/turnEngine/commitTurn.ts`

## 必须先画清的调用链

在 OpenSpec design 或 PROGRESS 中记录真实链路：

```text
input
→ deterministic mechanics routing
→ optional bounded tool stage
→ candidate DM record / typed delta
→ existing normalize and server guards
→ NPC consistency and epistemic validation
→ narrative validation
→ resolveDmTurn
→ commitTurn
→ one FINAL
→ background tick enqueue
```

逐个标注现有代码位置。不得凭函数名假定某一步已经执行。

## 行为要求

### 1. 路由门

- 只有 `shouldAttemptDmAgent(latestUserInput) === true` 的明确 mechanics 输入允许尝试 tool stage。
- `narrative` 和 `ambiguous` 必须直接走原 `PLAYER_CHAT` 流式路径。
- 路由必须是便宜、同步、确定性的纯函数，不能新增首字前 LLM 调用。
- 记录不含原始敏感文本的 routing telemetry：classification、reason code、是否进入 agent。

### 2. Agent 是否“处理成功”的语义

- 没有产生任何工具调用时，DM Agent 必须返回 `agentUsed=false` 或等价的“未处理”结果。
- 普通正文不能被 DM Agent 当成权威回合直接提交。
- tool call 失败但没有安全可提交的 StateDelta 时，应回退标准 Writer 路径或产生明确、可解析的失败候选；不能静默成功。

### 3. 移除 FINAL 旁路

- DM Agent stage 不得调用 `writer.close()`。
- DM Agent stage 不得直接写 `__VERSECRAFT_FINAL__`。
- `resolveDmTurn()` 本身不等于完整提交链；必须确认后续 `commitTurn`、validators、analytics 和 world tick 都执行。
- 统一由现有正常 final writer 写出唯一 FINAL。

### 4. StateDelta 权威性

- Tool handler 只能调用真实领域规则，不允许模型提供最终伤害、掉落、奖励或资源扣除结果。
- 所有写操作必须验证 session、位置、目标、注册表、资源、前置条件和幂等键。
- 只读工具可并行；写工具必须有明确顺序和单次提交保护。
- 工具结果必须转换为现有 DM/StateDelta 字段，不能创建第二套客户端状态协议。
- 不允许从 narrative 解析或补写状态。

### 5. 失败与预算

- 保留 Feature Flag，关闭时与改造前的标准 PLAYER_CHAT 行为一致。
- AbortSignal 必须穿透模型请求和工具 handler。
- 设置总轮数、每轮工具数、单工具超时和总 wall-clock budget。
- 不使用额外重试把 mechanics 回合拖到分钟级。
- 首个 status 反馈仍需满足 800ms p95 预算；工具执行期间输出可信且不泄露内部结构的状态帧。

## 推荐模块边界

若现有接线无法安全修补，优先提取类似：

```text
src/lib/playRealtime/mechanicsCommandStage.ts
```

它应拥有显式输入输出：

```text
input: request context + normalized intent + server state snapshot
output:
  not_attempted
  attempted_no_commit
  candidate_delta
  recoverable_failure
```

该 stage 不知道 SSE writer，不写 FINAL，不持久化客户端状态。

## 必须新增或修正的测试

至少覆盖：

1. 普通观察、对话、移动：零 tool call，走 PLAYER_CHAT。
2. 咨询式、疑问式和混合输入：零写工具调用。
3. 明确任务/锻造/战斗操作：进入 mechanics lane。
4. Agent 无 tool call：回退 Writer，不能吞回合。
5. 只读工具失败：不伪造写入。
6. 写工具失败：资源和状态零变化。
7. 工具超时/Abort：回合仍有可解析结尾或安全回退。
8. 同一 request 重放：写操作幂等。
9. 一回合只出现一个 FINAL。
10. Agent 命中后仍执行 NPC consistency、validateNarrative、resolve/commit 和 background tick decision。
11. Feature Flag off：旧路径不变。
12. `keys_missing`：仍为 `200 + event-stream + parseable final`。

优先使用 unit/contract 测试证明 stage 语义，再运行 E2E。

## 最低验证

根据真实改动选择并实际运行：

```bash
pnpm exec tsx --test src/lib/ai/tools/*.test.ts
pnpm exec tsx --test src/lib/turnEngine/*.test.ts
pnpm test:e2e:chat
pnpm test:e2e:contract
pnpm benchmark:chat:mock
npx eslint .
```

如通配命令成本过高，可先跑精确文件；阶段完成前必须补齐相关 contract 和 E2E。记录退出码和测试数量，不能只写“已验证”。

## 阶段完成定义

- mechanics router 已真实接入生产路径。
- 非 mechanics 输入不会调用 DM tools。
- 无工具调用不会被 Agent 吞掉。
- 代码中不存在 DM Agent 直接 FINAL/close 的提前返回路径。
- 工具结果通过唯一提交链落地。
- final once、feature flag off、keys_missing 和失败回退测试通过。
- OpenSpec artifact 与真实实现一致。
- PROGRESS 已记录验证、风险和回滚开关。
