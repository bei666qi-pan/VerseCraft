# VerseCraft 长叙事/关键决策闭环（V1）

本文档用于工程交接：描述本轮改造在现有仓库中的真实落点、回合协议、灰度开关、指标、回退方式与风险点。

## 解决了什么旧问题

- 旧问题：**前端默认“没有 options = 错误/必须补生成”**，导致每回合强制四选一，长叙事无法自然推进。
- 旧问题：回合协议缺少“回合意图”，无法表达“只推进叙事 / 必须决策 / 过场切换”三种状态。
- 旧问题：主角身份、世界在场、认知边界在模型输出后缺少最后一道“沉浸式兜底”，导致偶发漂移与越界无反应。
- 旧问题：玩家可用自然语言伪造世界事实（物品/地点/系统指令）来诱导模型。

## 新的回合协议是什么

服务端最终提交给前端的回合输出为 envelope（兼容旧字段），核心新增字段在：
- `src/features/play/turnCommit/turnEnvelope.ts`

关键字段：
- `turn_mode`: `"narrative_only" | "decision_required" | "system_transition"`
- `decision_required`: boolean
- `decision_options`: string[]（2–4）
- `auto_continue_hint`: string | null
- `protagonist_anchor/world_consistency_flags/anti_cheat_meta`（用于后续扩展与审计）

兼容策略：
- 旧字段 `options` **不删除**；旧 DM JSON 仍能解析。
- 当 `turn_mode=system_transition` 时，服务端 resolver 默认清空 `options`，避免误触。

## 前后端如何协同

### 服务端（/api/chat）

入口：`src/app/api/chat/route.ts`

- Prompt 编排：在 dynamic suffix 中注入
  - `turn_mode_policy_packet`（默认长叙事，关键节点才决策）
  - `protagonist_anchor_packet`（主角锚定）
  - `reality_constraint_packet`（现实感约束）
  - 以及既有：`npc_consistency_boundary_compact`、POV、continuity、runtime packets 等

- 回合模式校正（resolve 前）：
  - 若判定 `decision_required` 且模型不给选项：触发一次低成本 `decision_options` 修正（短 JSON 调用）
  - 若判定 `narrative_only` 但模型给了 options：降级为无选项回合

- 输入反作弊（输入审核之后、进主笔之前）：
  - 基于 `clientState`（结构化信任源）比对伪造声明
  - 将“结果伪造”重写为“尝试动作”，或在极端情况下给沉浸式兜底

### 前端（/play）

入口：`src/app/play/page.tsx`

- 识别 `turn_mode`：
  - `decision_required`：继续使用现有 `PlayOptionsList`
  - `narrative_only/system_transition`：不再把缺 options 视为错误；显示低打扰“继续推进”按钮（非四选项、非 options regen）
- options regen 只在确实需要决策时触发：
  - `auto_missing_main`、`auto_switch`、手动“整理选项”均被回合模式门闸约束

## 灰度开关与回退方式

服务端开关在：`src/lib/rollout/versecraftRolloutFlags.ts`

- `VERSECRAFT_ENABLE_LONG_NARRATIVE_MODE`
- `VERSECRAFT_ENABLE_DECISION_TURN_MODE`
- `VERSECRAFT_ENABLE_PROTAGONIST_ANCHOR_PACKET`
- `VERSECRAFT_ENABLE_REALITY_CONSTRAINT_PACKET`
- `VERSECRAFT_ENABLE_WORLD_POST_GENERATION_REWRITE`
- `VERSECRAFT_ENABLE_LANGUAGE_ANTI_CHEAT`

客户端开关在：`src/lib/rollout/versecraftClientRollout.ts`

- `NEXT_PUBLIC_VERSECRAFT_ENABLE_CONTINUE_BUTTON`

回退原则（模块独立）：
- 关闭任一开关不会破坏其它链路；例如关闭反作弊只会跳过输入重写，仍保留安全审核。
- 关闭后置修正会跳过主角漂移/叙事 guard 的改写，但不会影响 resolve/结算/存档。

## 指标与观测

指标接入到现有进程内 metrics：`src/lib/observability/versecraftRolloutMetrics.ts`，并在 `route.ts` / `npcConsistency` / 反作弊处累加。

建议在现有 admin analytics 导出时采样这些字段（无需新增监控系统）。

## 风险点

- 模型不遵守 turn_mode：服务端有校正层，但仍可能出现边界误判（需观测 turn_mode 分布与补救次数）。
- 反作弊误伤：已避免把“我想去X/我试着拿Y”当伪造；仍需通过灰度开关快速回退。
- 后置改写过强：已做沉浸式保守改写，且可通过 `VERSECRAFT_ENABLE_WORLD_POST_GENERATION_REWRITE` 关闭。

## 下一步最值得优化（方向）

- 用更精确的结构化任务/线索摘要进入 clientState（减少“任务完成伪造”只能靠文本判断的问题）
- 对 `system_transition` 的判定来源做更明确的系统信号映射（结算/强制事件/终局）
- 把 turn_mode/decision_options 的 UI 细化为更一致的“决策卡片”体验（仍保持整体风格）

