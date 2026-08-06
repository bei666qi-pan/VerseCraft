## 1. 基础设施搭建

- [x] 1.1 安装 `@langchain/langgraph` 依赖：`pnpm add @langchain/langgraph`
- [x] 1.2 创建 `src/lib/langgraph/` 模块目录结构（`index.ts`, `featureFlag.ts`, `checkpointer.ts`, `directorHintBuilder.ts`）
- [x] 1.3 在 `src/lib/config/` 中新增 `VERSECRAFT_ENABLE_LANGGRAPH` 和 `VERSECRAFT_ENABLE_LANGGRAPH_CHECKPOINT` 配置项，默认 `false`
- [x] 1.4 验证安装：`pnpm build` 确认无编译错误

## 2. World Director 主图实现

- [x] 2.1 定义 `WorldDirectorGraphState` 类型（`src/lib/langgraph/worldDirectorState.ts`）：映射 `WorldEngineTickPayload` + 流程中间态 + `hasPlan` + `planConfidence` + `directorHintBlock`
- [x] 2.2 实现 `load_context` 节点：调用现有 `loadRecentWorldFacts` + `loadRecentAgendaSummary` + `loadDirectorState`；失败时设置 `hasPlan: false`
- [x] 2.3 实现 `build_messages` 节点：调用现有 `buildWorldEngineMessages`
- [x] 2.4 实现 `run_reasoner` 节点：调用现有 `runOfflineReasonerTask`/`runWorldDirectorReasonerWithTools`; 失败时重试一次，二次失败走 fallback（`hasPlan: false`）
- [x] 2.5 实现 `parse_delta` 节点：调用现有 `parseWorldEngineDeltaJson`；非法 JSON 时 repair 一次，二次失败 set `hasPlan: false`
- [x] 2.6 实现 `validate_plan` 节点：调用现有 `validateDirectorPlan`；违规时 set `planConfidence: "degraded"`
- [x] 2.7 实现 `run_critic` 节点（可选）：调用现有 `runDirectorPlanCriticTask`，失败不阻塞
- [x] 2.8 实现 `apply_social_gm` 节点：调用现有 `applySocialGmDeltas`
- [x] 2.9 实现 `write_outputs` 节点：调用现有 `writeWorldEngineOutputs`；失败时 rollback agenda
- [x] 2.10 实现 `compute_next_state` 节点：调用现有 `computeNextDirectorState` + `saveDirectorState`
- [x] 2.11 实现 `build_director_hint` 节点：新增 `directorHintBuilder.ts` 纯函数，根据 `structuredDelta` + `directorState` + `hasPlan` 生成 `directorHintBlock`（仅方向性内容，不含具体叙事）
- [x] 2.12 定义主图拓扑（`src/lib/langgraph/worldDirectorGraph.ts`）：`StateGraph` + `.addNode()` + `.addEdge()` + `.addConditionalEdges()`
- [x] 2.13 实现条件边：`loadError → END`, `reasoner fail → retry/fallback`, `parse fail → repair/skip`, `validate violation → degraded`, `write fail → rollback`
- [x] 2.14 在 `src/lib/worldEngine/engine.ts` 中添加 `runWorldEngineTickGraph()` 入口，根据 feature flag 分发
- [x] 2.15 单元测试 `directorHintBuilder`：验证输出仅含方向性内容，不含具体叙事 — 9 tests pass
- [x] 2.16 单元测试主图：验证拓扑、条件路由、`hasPlan` 信号在各场景的正确性 — 5 tests pass

## 3. Plan 引导写作 agent 集成

- [x] 3.1 在 `src/lib/playRealtime/promptAssembly.ts` 中实际调用 `buildDirectorHintBlock`（当 `enableLangGraph=true`）
- [x] 3.2 实现 `hasPlan` 驱动的分支：`hasPlan: false` → 不注入 hint（自主模式）；`hasPlan: true` → 从 `directorDigestForPrompt` 重建 `structuredDelta` 调用 `buildDirectorHintBlock`
- [x] 3.3 `directorHintBlock` 格式包含"方向指引，具体内容自行创作"提示（在 `directorHintBuilder.ts` 中实现）
- [x] 3.4 E2E 测试：`e2e/world-director-langgraph.spec.ts` — fresh session（`hasPlan=false`）和 two-turn session（hint injected）

## 4. Actor Simulation 子图实现

- [x] 4.1 定义 `ActorSimGraphState` 类型（`src/lib/langgraph/actorSimulationSubgraph.ts`）
- [x] 4.2 实现 thin wrapper 节点，委托现有 `runActorSimulationPhase`
- [x] 4.3 错误处理：运行时异常不阻塞图执行
- [ ] 4.4 在主图 `actor_simulation` 节点中作为编译子图调用（待后续集成，当前为独立可调用子图）
- [ ] 4.5 单元测试（待后续补充 mock 环境）

## 5. DM Agent 图实现

- [x] 5.1 定义 `DmAgentGraphState` 类型（`src/lib/langgraph/dmAgentGraph.ts`）
- [x] 5.2 实现 thin wrapper 节点，委托现有 `runDmAgentTurn`
- [x] 5.3 硬约束保留：30s 超时通过 `graph.invoke({ timeout: 30000 })` 实现
- [ ] 5.4 在 `dmAgentOrchestrator.ts` 中添加 feature flag 分发（待 `VERSECRAFT_ENABLE_DM_AGENT` 成熟后集成）
- [ ] 5.5 单元测试（待后续补充 mock 环境）

## 6. Checkpoint 机制

- [x] 6.1 实现 `MemorySaver` 工厂（`src/lib/langgraph/checkpointer.ts`），预留 PostgreSQL 接口
- [ ] 6.2 PostgreSQL 持久化（待 `@langchain/langgraph-checkpoint-postgres` 包安装）
- [ ] 6.3 中断恢复逻辑（MemorySaver 在进程内有效，跨进程恢复需 PostgreSQL）

## 7. 配置与特性开关

- [x] 7.1 `VERSECRAFT_ENABLE_LANGGRAPH` 和 `VERSECRAFT_ENABLE_LANGGRAPH_CHECKPOINT` 配置解析
- [x] 7.2 在 `src/lib/worldEngine/config.ts` 中添加 `enableLangGraph` 字段（默认 `false`）
- [x] 7.3 `runWorldEngineTick()` 分发：`enableLangGraph ? runWorldEngineTickGraph() : legacy`
- [x] 7.4 关闭开关时现有构建通过（legacy 路径不受影响）

## 8. Analytics 集成

- [x] 8.1 新增 `world_engine_langgraph_node` analytics 事件类型
- [x] 8.2 LangGraph 路径每个节点 emit 事件（`node_name`, `duration_ms`, `status`, `tick_id`, `hasPlan`）
- [x] 8.3 事件使用 idempotency key 语义
- [ ] 8.4 E2E 验证（`world_engine_langgraph_node` 由 worker 进程产生，E2E 无法直接观测；通过 Langfuse span 间接验证）

## 9. 集成测试与验证

- [x] 9.1 E2E 测试：`e2e/world-director-langgraph.spec.ts` — 10 个测试覆盖 SSE 契约、LangGraph flag 切换、directorHintBlock 注入、analytics、并行隔离、status frame
- [x] 9.2 两阶段行为 E2E：fresh session → `hasPlan=false`（自主模式），two-turn session → hint injected
- [x] 9.3 Langfuse tracing：每个图节点 emit `world_director.<nodeName>` stage span
- [x] 9.4 `pnpm lint` — 零错误零告警
- [x] 9.5 `pnpm build` — 构建成功
- [x] 9.6 单元测试 — 14/14 pass

## 10. 真实链路验证（本次新增）

- [x] 10.1 promptAssembly 实际调用 `buildDirectorHintBlock`（非占位，非假通过）
- [x] 10.2 Langfuse stage span 追踪每个图节点（`startStageSpan` + `end`）
- [x] 10.3 E2E 10 测试覆盖真实 `/api/chat` 管道（非 mock，发 HTTP 请求、解析 SSE、验证 DM JSON）
- [x] 10.4 特性开关双路径 E2E：`VERSECRAFT_ENABLE_LANGGRAPH=true` 和 `false` 分别测试
