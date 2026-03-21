# AI 调用治理（成本 / 门控 / 缓存 / 观测）

实现位置：`src/lib/ai/governance/*`、`src/lib/ai/debug/observabilityRing.ts`、`src/lib/ai/telemetry/log.ts`、`TASK_POLICY`（`taskPolicy.ts`）。

## 成本控制规则表（代码约束）

| TaskType | 主模型倾向 | 预算等级 | max_tokens（策略上限） | 流式 | 备注 |
|----------|------------|----------|-------------------------|------|------|
| PLAYER_CHAT | DeepSeek-V3.2 | critical | 1408 | 是 | 在线主链路；禁止 reasoner / MiniMax |
| PLAYER_CONTROL_PREFLIGHT | GLM → V3.2 | low | 512 | 否 | 控制面；可短缓存 |
| INTENT_PARSE | GLM | low | 640 | 否 | |
| SAFETY_PREFILTER | GLM | low | 384 | 否 | |
| RULE_RESOLUTION | V3.2 | high | 1792 | 否 | |
| COMBAT_NARRATION | V3.2 | high | 1280 | 否 | |
| SCENE_ENHANCEMENT | MiniMax → V3.2 | high | 448 | 否 | **仅门控命中 + 采样 + 会话预算** |
| NPC_EMOTION_POLISH | MiniMax | high | 384 | 否 | 同上 |
| WORLDBUILD_OFFLINE | reasoner | medium | 3072 | 否 | 离线；可版本缓存 |
| STORYLINE_SIMULATION | reasoner | medium | 6144 | 否 | 离线；可版本缓存 |
| DEV_ASSIST | reasoner | medium | 3072 | 否 | 管理分析；可缓存 |
| MEMORY_COMPRESSION | V3.2 | medium | 1792 | 否 | **不缓存**（状态演进） |

`deepseek-reasoner` 仅出现在离线类任务；在线路径由 `TASK_MODEL_FORBIDDEN` 硬禁止。

## 高价值增强触发规则（MiniMax / 感官层）

须**同时**满足：

1. **控制面信号**：`enhance_scene` 且 `high_value_scene` **或** `enhance_npc_emotion` 且 `in_dialogue_hint`（与 `enhancementRules.ts` 一致）。
2. **评分 ≥ 32**：由确定性规则累加，例如：首回合入场、深层/Boss 语境、紧张 BGM、`sanity_damage` 高、稀有掉落信号、战斗氛围等。
3. **强制通道**：评分 ≥ 68 时跳过随机降采样。
4. **否则**：在 `sampleEnhancementAttempt` 中按分数段 12% / 28% / 55% 概率放行。
5. **会话预算**：冷却（默认 90s）+ 每小时次数上限（默认 10）；由 `sessionBudget.ts` 执行。
6. **运行模式**：仅 `AI_OPERATION_MODE=full` 时启用增强层。

平凡轮次（评分不足、无控制面信号、被采样剔除、或预算用尽）**不会**调用 MiniMax。

## 缓存策略表

| 数据类型 | 键空间 | TTL | 条件 |
|----------|--------|-----|------|
| 控制面预检 JSON | `vc:ai:pf:{version}:user:session:hash` | `AI_CACHE_TTL_CONTROL_SEC`（默认 50s） | `risk_level !== high` 才写入 |
| DEV_ASSIST 完成结果 | `vc:ai:{version}:DEV_ASSIST:hash(messages)` | 240s | 可 `AI_RESPONSE_CACHE_ENABLED=0` 关闭 |
| WORLDBUILD_OFFLINE | 同上 | 3600s | 版本号 `VERSECRAFT_AI_CACHE_VERSION` |
| STORYLINE_SIMULATION | 同上 | 900s | 同上 |
| 玩家记忆压缩 | — | — | **不缓存** |

Redis 可用时走 `SETEX`/`GET`；否则进程内 Map（容量有界）。

## 限流与配额

| 维度 | 机制 | 默认 |
|------|------|------|
| 会话控制面 | `allowControlPreflightForSession` 滑动窗口 | 48 次/分钟/会话 |
| 全局 LLM IP | 既有 `checkLlmRateLimit` | 保留 |
| 用户日 Token / 动作 | `quota.ts` + DB | 保留 |
| 增强层 | 冷却 + 小时 cap | 90s / 10 次 |

## 日志字段表（`ai.telemetry` / `ai.observability`）

| 字段 | 说明 |
|------|------|
| `type` | `ai.telemetry` 或 `ai.observability` |
| `ts` | ISO 时间 |
| `requestId` | 请求关联 ID |
| `task` | TaskType |
| `modelId` / `providerId` | 实际模型与厂商 |
| `phase` | start / success / error / preflight_cache_hit / enhance_skip:* / enhance_applied |
| `latencyMs` | 毫秒 |
| `stream` | 是否流式主链路 |
| `cacheHit` | 是否命中缓存 |
| `fallbackCount` | 模型 fallback 次数 |
| `usage` | 上游 token 结构（telemetry） |
| `totalTokens` | 汇总（observability） |
| `estCostUsd` | **启发式**美元估算（telemetry success） |
| `userIdHash` | `sha256(userId)` 前 12 位，**非明文** |
| `message` | 仅截断的诊断/错误片段，**不含用户剧情全文** |

管理端：`GET /api/admin/ai-routing` 返回 `observability` 环形样本 + 原有 routing / 熔断快照。

## 环境变量（可选调参）

见根目录 `.env.example` 中 `AI_CACHE_*` / `AI_PREFLIGHT_*` / `AI_ENHANCE_*` / `VERSECRAFT_AI_CACHE_VERSION`。
