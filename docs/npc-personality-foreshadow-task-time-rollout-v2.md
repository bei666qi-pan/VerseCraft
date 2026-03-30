# NPC 人格 · 校源伏笔 · 任务层 · 细粒度时间 — 阶段 8 上线与灰度（v2）

本文档描述 VerseCraft 阶段 8 的工程化方案：**可灰度、可测试、可上线、可回滚**，目标是把「更鲜明的人物、更稳的高魅力 NPC、更高级的悬疑揭露、更自然的任务体验、更可信的时间感、更低的出戏率」落到可观测、可验收的链路上。

---

## 1. 本次修复范围

- **Feature flags（环境变量）**：见 `src/lib/playRealtime/npcNarrativeRolloutFlags.ts`  
  - `VERSECRAFT_ENABLE_NPC_PERSONALITY_CORE_V2`  
  - `VERSECRAFT_ENABLE_MAJOR_NPC_FORESHADOW`  
  - `VERSECRAFT_ENABLE_TASK_MODE_LAYER`  
  - `VERSECRAFT_ENABLE_FINE_GRAIN_TIME_COST`  
  - `VERSECRAFT_ENABLE_PERSONALITY_VALIDATOR`  
  - `VERSECRAFT_ENABLE_FORESHADOW_VALIDATOR`  
  - `VERSECRAFT_ENABLE_TASK_MODE_VALIDATOR`  
  - `VERSECRAFT_ENABLE_TIME_FEEL_VALIDATOR`  
  - `VERSECRAFT_ENABLE_XINLAN_REVEAL_SPECIAL_CASE`  
  - `VERSECRAFT_NPC_PERSONALITY_DEBUG`  
  - 父级：`VERSECRAFT_ENABLE_NARRATIVE_RHYTHM_VALIDATOR`（未设子开关时回退链）
- **运行时 packet 降级**：`src/lib/playRealtime/actorConstraintPackets.ts` — 关开关时人格/伏笔/任务层/时间档位不注入或降级为占位。
- **后置校验门闸**：`src/lib/npcConsistency/narrativeRhythmGate.ts` — 子开关独立；欣蓝 `XINLAN_STRICT` vs 全阶梯 `neverLeak` 由 `VERSECRAFT_ENABLE_XINLAN_REVEAL_SPECIAL_CASE` 控制。
- **客户端与校验衔接**：`src/store/useGameStore.ts` — `【rt_task_layers】` 仅在 `enableTaskModeLayer()` 为真时写入 playerContext。  
- **Telemetry**：`src/lib/npcConsistency/validator.ts`、`src/app/api/chat/route.ts` 的 `epistemicRollup` 补齐阶段 8 观测字段。
- **测试**：`src/lib/npcConsistency/phase8GoldenScenes.test.ts`（golden scenes）、`narrativeRhythmValidators.test.ts`（矩阵补充）。

---

## 2. 核心链路变化

1. **玩家上下文**（含任务层行）→ `buildActorConstraintBundle` / `parseRtTaskLayers`  
2. **模型输出** `narrative` → `applyNpcConsistencyPostGeneration` → `applyNarrativeRhythmGate`（按子开关跑人格 / 校源 / 任务层 / 时间感）  
3. **Analytics**：`chat_request_finished` 的 `epistemicRollup` 带上 `npcPersonalityPacketChars`、`majorNpcDifferentiationScore`、`taskModeDistribution`、`fineTimeCostUsage`、`personalityRewriteCount`、`avgFormalTaskDelayFromFirstContact` 等；`promptCharDelta` / `firstChunkLatencyMs` 与既有链路同源。

---

## 3. 灰度建议

| 阶段 | 建议 | 说明 |
|------|------|------|
| 0% | 仅内测 / 预览服 | 打开 `VERSECRAFT_NPC_PERSONALITY_DEBUG` 观察门闸日志 |
| 5–10% | 先开 **packet**（`CORE_V2`、`FORESHADOW`、`TASK_MODE`/`FINE_TIME`） | 关 **validator** 子开关，确认 prompt 体积与 TTFT |
| 10–25% | 打开 **personality + foreshadow** 子校验 | 看 `foreshadowLeakCount`、`personalityRewriteCount` |
| 25–50% | 打开 **task + time** 子校验 | 看 `taskModeMismatchCount`、`timeFeelMismatchCount` |
| 50%+ | 全量子校验 | 对比 `majorNpcDifferentiationScore` 分布与客诉 |

**欣蓝**：`VERSECRAFT_ENABLE_XINLAN_REVEAL_SPECIAL_CASE` 默认 `true`（较窄规则、保留牵引）；若线上「牵引过宽」再考虑阶段性关闭以收紧。

---

## 4. 风险与回滚策略

| 风险 | 缓解 | 回滚 |
|------|------|------|
| 人格/伏笔校验误杀 | 子开关独立关闭；`rewriteNarrativeHeavyLeak` / `appendSoftHedge` 保守改写 | 关 `VERSECRAFT_ENABLE_PERSONALITY_VALIDATOR` 或 `FORESHADOW_VALIDATOR` |
| Prompt 变长 | 观测 `promptCharDelta`、`npcPersonalityPacketChars` | 关 `NPC_PERSONALITY_CORE_V2` / `MAJOR_NPC_FORESHADOW` |
| 任务层与 UI 不一致 | `TASK_MODE_LAYER` 关则 client 不再发 `【rt_task_layers】` | 关 `VERSECRAFT_ENABLE_TASK_MODE_LAYER` |
| 欣蓝过严或过松 | 切换 `XINLAN_REVEAL_SPECIAL_CASE` | 单独调该开关 |
| 全链路异常 | — | `VERSECRAFT_ENABLE_NARRATIVE_RHYTHM_VALIDATOR=false` 或 `VERSECRAFT_ENABLE_NPC_CONSISTENCY_VALIDATOR=false`（按你们环境策略） |

---

## 5. 验收案例（与测试对应）

- **单元 / golden**：`pnpm test:unit` 含 `phase8GoldenScenes.test.ts`、`narrativeRhythmValidators.test.ts`。  
- **人工**：抽 3 条档 — 普通 NPC、欣蓝登记、北夏价码；低档 reveal 下不得出现「校源硬答案句」；正式任务叙事不得像冷开 UI 面板；轻/重档位与时间描写一致。

---

## 6. 观察指标（阶段 8）

| 指标 | 含义 / 备注 |
|------|-------------|
| `npcPersonalityPacketChars` | 本回合 `actor_personality_packet` JSON 字符量（粗粒度成本） |
| `majorNpcDifferentiationScore` | 门闸内启发式分数（高魅力、无漂移时偏高） |
| `foreshadowLeakCount` | 校源抢跑/禁词拦截次数 |
| `taskModeDistribution` | `soft_lead` / `conversation_promise` / `formal_task` 计数 |
| `avgFormalTaskDelayFromFirstContact` | 当前为 **null 占位**；正式任务需客户端/存档回合序统计后接入 |
| `fineTimeCostUsage` | 细粒度时间档位非 `standard` 且开关开启时计 1 |
| `timeFeelMismatchCount` | 叙事时间感与档位不一致 |
| `personalityRewriteCount` | 人格漂移且触发改写路径 |
| `promptCharDelta` | 与既有 epistemic 裁剪一致 |
| `firstChunkLatencyMs` | TTFT，与顶层同源 |

---

## 7. 二期可以做什么（本期故意不做）

- **`avgFormalTaskDelayFromFirstContact` 真值**：需要任务首次接触时间戳与 formal 升级事件，**本期仅占位**。  
- **学习型人格向量**：不做在线学习；保持规则 + 启发式。  
- **全量校源语义模型**：仍以规则与禁词阶梯为主，避免 LLM 二次校验成本与延迟。  
- **任务 DAG / 剧情编辑器**：本期不扩展任务系统内核，仅叙事层与校验。  
- **世界时钟物理模拟**：仍用档位 + 叙事对齐，不做真实秒级模拟。

---

## 8. 相关文件

- `src/lib/playRealtime/npcNarrativeRolloutFlags.ts`  
- `src/lib/playRealtime/actorConstraintPackets.ts`  
- `src/lib/npcConsistency/narrativeRhythmGate.ts`  
- `src/lib/npcConsistency/foreshadowValidator.ts`  
- `src/lib/npcConsistency/validator.ts`  
- `src/lib/epistemic/featureFlags.ts`  
- `src/app/api/chat/route.ts`  
- `src/store/useGameStore.ts`  
- `src/lib/npcConsistency/phase8GoldenScenes.test.ts`
