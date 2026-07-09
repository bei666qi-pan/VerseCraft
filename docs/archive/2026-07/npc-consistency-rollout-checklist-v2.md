# NPC 一致性与真实感：上线验收清单 v2（阶段 8）

本文档对应「认知裁剪 + 边界 JSON + 生成后校验 + 残响玩法」的工程化收口，用于灰度、观测与回滚。

## 1. 修复范围

- **注册表 / 权威包**：`actor_canon`、`npc_player_baseline`、`npc_scene_authority`、reveal 门闸与记忆特权摘要（`npc_consistency_boundary_compact`）。
- **生成前**：`detectCognitiveAnomaly`（玩家措辞旧识 / 深层真相抢跑等）+ `npc_epistemic_alert` 注入。
- **生成后**：`applyEpistemicPostGenerationValidation`（事实层）+ `applyNpcConsistencyPostGeneration`（叙事规则层，可独立开关）。
- **玩法向残响**：`npc_epistemic_residue_packet`（仅体感标签，禁止可核对旧事）+ 会话内 `epistemic_residue_recent_uses` 防连刷与 **cooldown**。

## 2. 核心链路变化

1. **请求进入** `/api/chat` → 解析焦点 NPC、在场集合、`maxRevealRank`。
2. **Feature flags 快照** `getEpistemicRolloutFlags()`：子系统可单独关闭（见下节 env）。
3. **边界包** `buildNpcConsistencyBoundaryCompactBlock`：受 `VERSECRAFT_ENABLE_NPC_CANON_GUARD` / `BASELINE` / `SCENE_AUTHORITY` 控制；关闭时子块降级为占位 JSON，避免误关整条链路。
4. **分层记忆** `buildActorScopedEpistemicMemoryBlock`：`VERSECRAFT_ENABLE_ACTOR_SCOPED_EPISTEMIC=0` 时注入短占位块，仍提示遵守同条 system 内其它 JSON。
5. **残响** `buildEpistemicResiduePerformancePlan`：`VERSECRAFT_ENABLE_NPC_RESIDUE`、冷却 `VERSECRAFT_NPC_RESIDUE_COOLDOWN_MS`、防重复深度 `VERSECRAFT_NPC_RESIDUE_ANTI_REPEAT_DEPTH`。
6. **流结束** `applyNpcConsistencyPostGeneration`：先事实校验（若开），再叙事校验（若开）；`chat_request_finished` 的 `epistemicRollup` 附带观测计数。

## 3. 灰度发布建议

| 阶段 | 建议 |
|------|------|
| 内测 | `VERSECRAFT_NPC_DEBUG=1`，小流量观察 `epistemicRollup` |
| 5% | 全开默认 true，仅监控 `npcConsistencyRewriteCount`、`anomalyDetected` |
| 25% | 确认 `firstChunkLatencyMs` 与 `promptCharDelta` 无异常回归 |
| 100% | 文档化 env 默认值；保留「单开关回滚」表（第 4 节） |

**环境变量（新名，默认均为「开启」语义下的 true，除非注明）**

- `VERSECRAFT_ENABLE_EPISTEMIC_GUARD`
- `VERSECRAFT_ENABLE_EPISTEMIC_VALIDATOR`（兼容 `VERSECRAFT_EPISTEMIC_POST_GUARD`）
- `VERSECRAFT_ENABLE_NPC_CONSISTENCY_VALIDATOR`（**显式设置时可与上一项解耦**）
- `VERSECRAFT_ENABLE_NPC_CANON_GUARD`
- `VERSECRAFT_ENABLE_NPC_BASELINE_ATTITUDE`
- `VERSECRAFT_ENABLE_NPC_SCENE_AUTHORITY`
- `VERSECRAFT_ENABLE_ACTOR_SCOPED_EPISTEMIC`
- `VERSECRAFT_ENABLE_NPC_RESIDUE`（兼容 `VERSECRAFT_EPISTEMIC_RESIDUE_GAMEFEEL`）
- `VERSECRAFT_ENABLE_XINLAN_HIGH_PRIVILEGE`（兼容 `VERSECRAFT_ENABLE_XINLAN_STRONG_MEMORY`）
- `VERSECRAFT_NPC_DEBUG`（兼容 `VERSECRAFT_EPISTEMIC_DEBUG_LOG`）
- `VERSECRAFT_NPC_RESIDUE_COOLDOWN_MS`（默认 `90000`）
- `VERSECRAFT_NPC_RESIDUE_ANTI_REPEAT_DEPTH`（默认 `3`）

## 4. 风险与回滚策略

| 症状 | 优先动作 |
|------|-----------|
| 延迟上升 | `VERSECRAFT_ENABLE_ACTOR_SCOPED_EPISTEMIC=0` 或提高 `AI_CHAT_TIERED_CONTEXT_BUILD` 相关预算（见 perf env） |
| 误杀对白 | `VERSECRAFT_ENABLE_NPC_CONSISTENCY_VALIDATOR=0`（保留事实层）或 `VERSECRAFT_ENABLE_EPISTEMIC_VALIDATOR=0` 且单独打开叙事层（高级） |
| 全员「太熟」 | `VERSECRAFT_ENABLE_XINLAN_HIGH_PRIVILEGE=0`（欣蓝降级为普通策略） |
| 残响过密/套话 | 增大 `VERSECRAFT_NPC_RESIDUE_COOLDOWN_MS` 或 `VERSECRAFT_ENABLE_NPC_RESIDUE=0` |
| 一键回滚旧行为 | `VERSECRAFT_EPISTEMIC_POST_GUARD=0` 且不显式打开 `NPC_CONSISTENCY_VALIDATOR`（叙事层随事实层关闭） |

## 5. 验收案例（自动化）

- **单测**：`src/lib/npcConsistency/validator.test.ts`、`src/lib/epistemic/detector.test.ts`、`src/lib/epistemic/residuePerformance.test.ts`
- **Golden scenes**：`src/lib/npcConsistency/goldenScenes.test.ts`（初见、夜读老人、高魅力、欣蓝、校源碎片措辞、离屏提及、地点纠偏、危机基线、validator、fast lane rank）
- **矩阵索引**：`src/lib/npcConsistency/rolloutMatrix.test.ts`
- **灰度占位**：`npcConsistencyBoundaryPackets.test.ts`、`actorScopedMemoryBlock.test.ts`、`featureFlags.env.test.ts`

## 6. 观察指标（`chat_request_finished` → `epistemicRollup`）

| 字段 | 含义 |
|------|------|
| `rolloutFlags` | 当次请求快照 |
| `anomalyDetected` / `anomalySeverity` | 生成前认知异常 |
| `validatorTriggered` / `rewriteTriggered` / `responseSafe` | 生成后校验与改写 |
| `npcConsistencyValidatorTriggered` / `npcConsistencyViolationTypes` | 叙事层 |
| `npcCanonFallbackCount` | 焦点 NPC 非注册表 id（占位卡） |
| `npcLocationMismatchCount` | 离屏开口等（代理指标） |
| `npcGenderMismatchCount` | 称谓与 canonical 冲突 |
| `npcAttitudeViolationCount` | 旧识口吻等 |
| `npcPrivilegeViolationCount` | 越权真相 / 高魅力 omnibus 等 |
| `npcConsistencyRewriteCount` | 任一层改写触发 |
| `residueTriggeredCount` | 本回合是否注入残响包 |
| `promptCharDelta` / `promptCharsDelta` | 相对未裁剪全局记忆的字符差 |
| `firstChunkLatencyMs` | 见 `buildChatRequestFinishedPayload` |

## 7. 二期故意不做（避免过度设计）

- 残响与好感/恐惧数值的**完整经济闭环**（本期仅标签 + 轻量随机门控）。
- 基于二次大模型的「智能重写」（本期规则 + 模板降级）。
- 全量 NPC–NPC 双人认知图（本期以焦点 actor + scene authority 为主）。
- 客户端实时展示 `security_meta` 调试 UI（仅服务端日志 / 受控 debug）。

---

**PR 自检**：`pnpm test:unit` 通过；生产环境勿默认开启 `VERSECRAFT_NPC_DEBUG`。
