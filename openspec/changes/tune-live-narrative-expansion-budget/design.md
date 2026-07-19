## Context

`/api/chat` 在主模型流结束后只对严重不足的 standard/reveal/climax narrative 启动 `NARRATIVE_EXPANSION`。该调用只替换 narrative，必须经 JSON、长度、协议泄露和“不得改变结论”校验，失败则保留原文。当前默认 2 秒预算小于实测 DeepSeek v4 Flash 正常扩写约 4 秒的响应时间，造成可预期的超时降级。

## Goals / Non-Goals

**Goals:**

- 让默认预算足以容纳真实网关的正常、已验证扩写响应。
- 保留首字路径、结构化状态和 SSE 终帧协议不变。
- 让任何可选扩写都无法绕过既有总回合预算和失败降级。

**Non-Goals:**

- 不改变主模型、prompt、turn mode、选项生成或状态裁决。
- 不保证每个模型响应都达到目标长度；模型不可用或不合规仍安全保留原文。

## Decisions

### 1. 将默认后置扩写预算提高到 10 秒

早期探测显示相同 gateway 在 4 秒内返回 270 字、且通过现有校验；新的多回合 live trace 同时复现了 4.7 秒成功、6.003 秒超时、7.8 秒成功与刚超过 8 秒的超时。10 秒覆盖当前已观测尾部波动。route 以 normal final p95 剩余时间夹紧单次可选扩写；真实基准仍要求整体 p50/p95 都符合产品预算，避免把“每一条都必须等于 p50”误当作质量策略。

备选是仅增加 prompt 中的长度要求；拒绝，因为模型已经能合规扩写，失败原因是调用超时。备选是取消扩写；拒绝，因为会把已确认的短文本问题留给玩家。

### 2. 维持可选后置阶段及原文降级

扩写不进入首字前路径、不修改 state delta；`AI_NARRATIVE_EXPANSION_ENABLED=0` 可关闭，任何超时、网关错误或校验失败都输出主模型原文。最终帧继续由既有收口与 validator 生成。

### 3. 用预算契约和真实回合验证，而非 mock 质量断言

单元测试只锁定预算和总回合边界；真实 API probe 验证扩写模型、SSE 终帧和玩家可见长度。不会把单次 live 成功外推为对全部叙事的证明。

## Risks / Trade-offs

- [后置 final 变慢] → 只在低于明确最低长度、且可扩写 tier 中触发；单次调用受 20 秒 p95 剩余预算夹紧，真实基准对 12 秒 p50 与 20 秒 p95 都设门禁。
- [模型扩写引入幻觉] → 保留既有 JSON、协议、长度、结论变更和最终 validator 收口；不合规结果丢弃。
- [供应商变慢] → 超时后原文照常提交，且可通过环境开关立即关闭扩写。

## Migration Plan

1. 提高默认预算并添加契约测试。
2. 用真实 gateway 跑短叙事 `/api/chat` probe，检查 SSE、final 和时延。
3. 若 final p95 越过 20 秒或扩写质量回归，设 `AI_NARRATIVE_EXPANSION_ENABLED=0` 或通过 `VC_NARRATIVE_EXPANSION_BUDGET_MS` 下降预算，无需数据迁移。
