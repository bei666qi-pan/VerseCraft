## Why

真实 `/api/chat` 回合已复现：主模型产生短叙事后，后置 `NARRATIVE_EXPANSION` 在约四秒能够生成安全、通过协议校验的扩写；但线上默认仅给它两秒，因此它会稳定超时，玩家仍收到过短回合。这个问题不会破坏 SSE 契约，却直接削弱互动叙事的可读性和行动反馈。

## What Changes

- 将默认的后置叙事扩写时间预算调至能容纳已测真实网关正常响应的范围（由 6 秒经 8 秒复测调整为 10 秒），并仍受总回合 p95 剩余预算限制；汇总基准继续对 p50/p95 都设门禁。
- 保持扩写为可关闭、可超时降级的后置步骤：失败时保留主模型原始 narrative，不改结构化状态、选项或首字路径。
- 增加预算契约与真实 API 复测，确认短叙事能在总回合预算内被安全扩写，且 SSE final 仍可解析。

## Capabilities

### New Capabilities

- `live-narrative-expansion-quality`: 受预算、协议与结构化状态边界保护的真实后置叙事扩写质量保障。

### Modified Capabilities

- 无。

## Impact

- 受影响代码：`src/lib/perf/waitingConfig.ts`、叙事扩写预算测试及真实 `/api/chat` 基准证据。
- SSE/DM JSON、客户端状态、数据库 schema 和 analytics 事件形状均不变；只会在已出现首字后的 final hooks 中增加可用等待时间。
- 首包与 TTFT 不受影响。扩写仍由 `AI_NARRATIVE_EXPANSION_ENABLED` 控制，并在超时、模型错误或协议校验失败时安全降级为原文本；总 final 仍由现有 12s p50 / 20s p95 预算夹紧。
- 非目标：不在主叙事中引入 reasoner、多 agent 协商、文本模板补写或对状态/选项进行第二次模型裁决。
