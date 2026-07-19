## Context

`/api/chat` 已在主模型流结束后以 budget、协议和状态约束执行可选 `NARRATIVE_EXPANSION`，但其失败降级只保留原文。真实 benchmark 因此能得到合法 SSE 与状态，却可能给玩家不可玩的短正文。首字已在扩写前送出，不能把第二次模型调用移到首字路径。

## Goals / Non-Goals

**Goals:**

- 使最终正文长度是否达到当前 `narrative_budget_packet.minChars` 可观测、可测试。
- 把扩写失败、预算不足或候选不足明确归类，而不伪造补写或改动结构化 delta。
- 让 live benchmark 以预算一致的阈值判断普通叙事质量。

**Non-Goals:**

- 不保证所有模型输出都能达标；超时仍安全提交原文。
- 不改变 SSE、在线模型角色、状态结算、任务或选项规则。

## Decisions

### 1. 使用当前叙事预算而非固定 180 字作为权威阈值

route 已裁决 turn tier；final hook 把实际字符数与该 budget 比较并记录 `met_minimum` 与失败原因。benchmark 将场景的预期下限与该 tier 对齐，避免把 micro 决策误判为普通探索失败。

### 2. 只增强后置证据与安全降级诊断

扩写保持可选且只替换 narrative。short、standard、reveal、climax 四种有明确长度下限的可扩写层级，只要 `narrativeUnderMin` 就可触发；诊断严重度只用于 telemetry，不能让轻微短缺绕过最低可玩长度。micro 仍保留紧迫截断语义。若扩写无法达标，保留原文并以结构化 telemetry/report 使 strict live gate 失败；拒绝本地模板补写，因为它会将测评结果伪装成 AI 叙事。

### 3. 保持 final 延迟预算

扩写继续受现有 6 秒、回合剩余预算和 feature flag 约束。任何修复不得延迟 status/first token；live 验收同时检查 p95 final 不越界。

### 4. 基准复用同一个长度权威

live benchmark 不再用 fixture 的历史 `minNarrativeChars` 作为另一个判定策略，而是调用与 `/api/chat` 相同的纯 `resolveNarrativeBudget`，并在输出中同时展示文档值与本回合权威最低值。这样 short 预算 160 字不会被误报为“必须 180 字”，同时任何低于实际预算的回合仍然严格失败。

## Risks / Trade-offs

- [更多 live gate 失败] → 这是暴露真实体验缺口；保留诊断可用于决定 prompt、模型或预算改进。
- [扩写质量不稳定] → 仅接受通过既有协议/结论/长度校验的候选，其他安全降级。
- [final 延迟上涨] → 现有预算夹紧、开关和 benchmark p95 gate 保留。
