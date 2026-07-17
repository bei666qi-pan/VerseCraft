# Codex 真实游玩测试报告 — 2026-07-11

## 执行范围

- 环境：本地 `http://127.0.0.1:666/play`，重启开发服务后执行。
- 角色：林岚；天赋：洞察之眼。
- 路径：创建角色 → 开场 → 手动调查行动 → 角色/任务/图鉴 → actions fallback → 天赋。
- 结论：**阻断**。首个真实玩家回合无法完成，不能进入持续游玩验证。

## 证据摘要

| 层 | 观察 | 证据 |
|---|---|---|
| 玩家回合 | 失败 | `PLAYER_CHAT` → `deepseek-v4-flash` → HTTP 403 / `SUBSCRIPTION_NOT_FOUND` |
| 选项修复 | 失败 | `INTENT_PARSE`（control）同为 HTTP 403；options regen 失败 |
| 天赋 | 失败且泄漏内部指令 | 洞察之眼将 `【系统强制干预…】` 原样作为可见玩家日志，然后模型失败 |
| 状态一致性 | 断层 | 开场叙事停在“如月公寓”走廊；角色/任务/图鉴却直接显示 `B1 安全中枢`、B1 主线和 2/6 任务 |
| Analytics | 写入失败 | heartbeat 的 `event_id` 主键与 `idempotency_key` 冲突未同一处理，报 23505 |
| DB schema | 高频日志噪声 | presence/启动反复尝试为 text embedding 建 vector_cosine_ops 索引，报 42804 |

## P0：玩家主循环不可玩

本轮真实动作“捡起校徽和电子表，查血手印。”返回“网站暂时无法完成本次生成，请稍后再试。”。

服务端 requestId `vc_chat_mrg78oab_e1695f804e153b`：

```text
task=PLAYER_CHAT
gatewayModel=deepseek-v4-flash
httpStatus=403
code=SUBSCRIPTION_NOT_FOUND
message=No active subscription found for this group
```

之后 options repair 对 `INTENT_PARSE` 进行两次 control 调用，同样因 `HTTP_4XX_AUTH` 耗尽链路。403 是不可恢复的配置/权限错误，不能触发 model retry 或 options repair。

**修复方向**：在 one-api 为当前 key 的 group 授权 `deepseek-v4-flash`，或把 `AI_MODEL_MAIN` / control role 指向该 group 已授权模型；应用侧应将 401/403 标为不可重试并阻止 repair fan-out。

## P0：天赋把内部提示词展示给玩家

发动“洞察之眼”后，阅读流出现：

```text
我【系统强制干预：玩家发动了"洞察之眼"。请在接下来的叙事中…】
```

问题位于 `src/app/play/page.tsx` 的 `onUseTalent()`：直接把内部控制 prompt 作为 `sendAction()` 的玩家文本。模型失败时，该文本已先写入玩家日志。

**修复方向**：把 talent effect 改为结构化 `talentInvocation` / `turnMode` 参数，由服务端构造 runtime packet；客户端日志只能写“发动了洞察之眼”，不得记录 prompt 内容。此问题需要 unit + SSE contract 回归。

## P1：新角色的叙事、位置、任务和图鉴不在同一世界状态

开场叙事是初到“如月公寓”的走廊，且描述校徽、电子表、血手印与脚步声；但未完成任何有效行动时：

- 角色面板显示位置：`B1 安全中枢`，原石：10。
- 任务面板显示已 `2/6`，任务要求去找 B1 的电工老刘。
- 图鉴默认筛选：`B1层已识别条目：0 / 7`。

这会让玩家无法理解当前所在场景与任务目标，且使第一回合的 state delta 基线不可信。

**修复方向**：开场 narrative、`playerLocation`、默认任务、chapter state 和图鉴楼层必须从同一 opening snapshot 初始化；新增 E2E 断言：首屏 narrative 的场景锚点与角色面板位置/任务首个地点一致。

## P1：输入长度与产品承诺不匹配

移动输入上限为 20 字（`src/features/play/playConstants.ts`），首次自然语言行动 30 字就被拒绝。VerseCraft 定位允许自然语言行动，20 字会迫使玩家压缩调查、对话和复合行为。

**修复方向**：把前端/服务端的统一上限提升为适合中文行动表达的值（建议 80–120），并保留 token/风险/速率守卫；不要以极短字符上限承担成本控制。

## P1：heartbeat 幂等冲突与 schema 尝试影响可观测性

1. `src/app/api/analytics/heartbeat/route.ts` 在同一分钟复用 `event_id`，但 SQL 仅写 `ON CONFLICT (idempotency_key) DO NOTHING`。主键先冲突会导致 23505，heartbeat 返回 200 但 analytics 未可靠写入。
2. `ensureRuntimeSchema` 在 `embedding_vector` 实际为 text 的环境，仍尝试创建 `vector_cosine_ops` 索引；启动与 presence heartbeat 都产生 42804。

**修复方向**：

- heartbeat 使用不冲突的事件主键或 `ON CONFLICT (event_id) DO NOTHING`，并覆盖两种幂等冲突路径的集成测试。
- schema 检查必须验证列数据类型为 vector 后才创建 vector index；失败后记忆 capability，禁止每次 heartbeat 重试。

## P2：内容数据完整性警告

浏览器控制台记录：`N-044`、`N-045` 缺少 `CANON_GENDER`，走 gender fallback。应补 registry 数据或把性别字段改为可选且不报警的显式策略，避免在主游玩控制台持续污染信号。

## 本轮建议的修复顺序

1. 修复 one-api group/model 授权，并用 `verify:main-ai-live` 做一次真实 PLAYER_CHAT + control preflight。
2. 让 401/403 快速失败且不触发 options repair；修复天赋控制 packet 泄漏。
3. 修复 opening snapshot 的位置/任务/图鉴一致性，并加浏览器 E2E。
4. 修复 analytics heartbeat 和 vector schema capability 检查。
5. 放宽自然语言行动上限，之后重新执行 10 回合 Codex 游玩验证。

## 直连 DeepSeek 文本回合复测与消耗（同日）

通过本地 `VC_AI_DIRECT_*` 覆盖，真实请求已确认直连 `https://api.deepseek.com/v1/chat/completions`，`deepseek-v4-flash` 返回 200。5 回合文本 playthrough 的主模型实际用量如下（来自 `chat_generation_metrics`）：

| 回合 | 输入 tokens | 缓存输入 | 输出 tokens | 总 tokens | Final latency |
|---:|---:|---:|---:|---:|---:|
| 1 | 10,762 | 8,064 | 353 | 11,115 | 7.03s |
| 2 | 10,748 | 10,624 | 294 | 11,042 | 3.92s |
| 3 | 10,751 | 8,064 | 347 | 11,098 | 4.43s |
| 4 | 10,752 | 8,064 | 176 | 10,928 | 4.50s |
| 5 | 10,752 | 8,064 | 192 | 10,944 | 5.28s |
| **合计** | **53,765** | **42,880** | **1,362** | **55,127** | **25.17s** |

结论：稳定 prompt cache 已命中大量输入，但每回合仍约有 2.1k–2.7k 非缓存输入；并且部分回合启动了 `NARRATIVE_EXPANSION` 后处理，增加尾延迟和额外但当前未在主回合聚合指标中显式列出的 token 消耗。

本轮模型输出五回合完全重复（“你停下脚步，环顾四周……”），此前 mock judge 因评分取整仍报告通过。已修复该测试误判：任何 major 叙事连续性问题都会使 playthrough `passed=false`。

后续成本优化优先级：

1. 在 `chat_generation_metrics` 中聚合并记录 main、control、enhance 的每个 task usage，避免 expansion 成本成为盲区。
2. 将 4k chars runtime packet 改为 state-delta/scene-scoped packet，并对未变化 packet 做 hash reuse；这是比缩短测试样本更有效的降本点。
3. 对相同 narrative hash 连续出现时停止后续回合并将 trace 回流到回归集，避免为已确定的重复问题继续付费。
4. 仅在 deterministic validator 通过且 narrative 长度不足时才触发 expansion，并为它设置独立 token 与 wall-clock budget。

已实施：`NARRATIVE_EXPANSION` 结果现在携带 usage，回合 telemetry 会记录其 input/output/total token，且该 total 会并入 token persistence 与 analytics 的回合消耗。此前扩写调用是成本盲区。

## 专项重构后的真实复测（通过）

已将 live TUI harness 改为携带与 `/play` 一致的 `latestUserInput`、会话历史、`playerContext` 与 client-first state；此前的最小请求会错误地绕过这些运行时上下文，不能代表真实游玩。

随后定位到重复兜底的直接原因：route 的最终“未注册中文姓名”守卫使用高召回启发式，只要命中一个疑似姓名就用固定安全文案替换**整个**回合，正常的中文描述也会被误伤。该守卫现改为：

- 仅把带明确人物谓词的命中视为高置信；
- 高置信未知姓名仅匿名化为“陌生人”，保留行动、场景与结果；
- 低置信命中仅写 commit audit flag，不破坏玩家回合。

真实 `deepseek-v4-flash` HTTP/SSE 三回合 smoke（2026-07-11）：

| 回合 | 动作 | Final latency | 结果 |
|---:|---|---:|---|
| 1 | 快速结束当前环节 | 5.41s | 走廊、灯管、人影与脚步声具体承接 |
| 2 | 继续前进 | 5.37s | 承接人物、信号与走廊选择 |
| 3 | 利用窗口推进 | 3.38s | 承接门缝、房间与可观察物件 |

结果：3/3 达到 final、0 降级、0 重复、0 静态安全兜底；p95 5.41s。报告：`.runtime-data/eval/codex-tui-passed/live-playthrough-report.md`。相关 lint 无 error；叙事、人名、playthrough、prompt、扩写与 SSE 契约测试共 65 项通过。

## 2026-07-12 机制闭环专项最终结果

服务端新增并接通了基于结构化 client state 与明确玩家动作的注册机制裁决，未从 narrative 反推状态：

- 世界注册掉落：三楼铁管只能在对应地点拾取，进入武器背包后才能装备。
- 战斗：注册威胁的明确攻击动作同步写入 `main_threat_updates` 与 `weapon_updates`。
- 任务/职业试炼：仅在任务 active、地点正确且明确交付时完成；模型与 guard 同时输出时按任务 ID 幂等去重。
- 锻造：B1 配电间、老刘在场、注册武器与资源满足时执行真实修复裁决。
- 职业：试炼完成后复用客户端同一套 `computeProfessionState` / `certifyProfession` 完成守灯人认证。

最终真实 DeepSeek `/api/chat` 专项门禁：5/5 场景通过，5 个场景均以 `objective_reached` 结束，`mechanicChecks`（weapon / professionTrial / quest / combat / forge）全部为 `true`，无 error、softlock、失败簇或重复任务 ID。报告：`.runtime-data/eval/live-mechanics-2026-07-12T03-21-05-386Z/summary.json`。

交付前验证：相关单元/契约测试 96 项通过，定向 ESLint 无 error，`pnpm build` 成功。

## 2026-07-12 玩法边界与结局专项

新增真实边界活动覆盖：行囊已满、使用不存在物品、货币数值越界、跨层瞬移意图、与死亡 NPC 互动，以及完整结局优先级与状态机。

本轮发现并修复：

- 结局状态机首次 eligibility 锁死后，高优先级死亡无法在最终选择前覆盖逃脱/终焉。现仅在 `eligible` 阶段允许更高优先级替换；一旦进入最终选择则继续冻结。
- 死亡 NPC 列表此前未进入真实 `/api/chat` 结构化快照，模型可能让死者现身并开口。现已接入 store → client state → request validation → reality packet → post-generation hard guard，并清除死者位置更新。
- `recovery-inventory-full` 和死亡 NPC 场景的初始状态此前与场景描述不一致，已补齐满行囊和死亡列表 fixture。
- 跨层测试从“最终抵达 B2 即失败”修正为检查是否真的瞬移；多回合经楼梯正常移动允许通过。

最终真实 DeepSeek 活动：5/5 玩法场景通过；`inventoryFull / illegalItems / teleportBlocked / deadNpcStayedDead / currencyBounded` 全部为 `true`。结局检查 `ordinaryDoesNotEnd / deathImmediateSettlement / escapeOutcomes / doomDay10 / abandon / deathPriority / finalChoiceSettlement` 全部为 `true`。报告：`.runtime-data/eval/live-boundaries-2026-07-12T03-33-38-897Z/summary.json`。

交付前验证：相关边界、结局 property、SSE、client state 与 playthrough 测试 129 项通过；`pnpm build` 成功。
