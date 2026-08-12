## Why

VerseCraft 当前存在“自动测试通过但真实产品不可用”的质量断层：线上开场选项刷新会被通用空动作校验拦截，失败又被客户端静默隐藏；品牌标识没有可执行的单一渲染契约；Langfuse 虽有大量代码但缺少运行验收；RAG 检索也没有 RAGAS 口径的离线评测与趋势闭环。现在需要用真实用户路径、可关联 trace 和离线质量分数把发布判断闭合起来。

## What Changes

- 修复 `options_regen_only` 在没有历史 user 消息的开场场景：客户端始终提交明确的元请求，服务端将专用请求与普通玩家行动校验分离，同时保持 `200 + SSE`、status 帧和现有 payload 兼容。
- 让选项生成失败可诊断：玩家看到可操作的失败/重试提示和短 request ID；服务端返回结构化失败原因并关联 Langfuse trace，不泄露 prompt、叙事或玩家原文。
- 建立 Logo 单一渲染契约和移动端截图回归，消除同一品牌位的重复 mark、伪元素或重复 shell 挂载；不改变现有视觉方向和页面结构。
- 在现有 Langfuse adapter 上补齐真实配置预检、trace/export 健康探针、flush 验收、options-only trace 与离线 eval score 上传；Langfuse 继续 fail-open，不进入首字前阻塞路径。
- 引入 RAGAS 兼容的 RAG 质量评测（用户所称 “RAGES” 按 RAGAS 落地），覆盖 context precision、context recall、faithfulness 与 answer relevancy，并将结果写入本地报告、基线比较和 Langfuse score。
- 增加本地 production preview 与线上 canary：真实浏览器执行开场→展开选项、验证 DOM/console/SSE/截图，并把“业务结果正确”与“HTTP/E2E 壳层通过”分开判定。
- 评测闭环只输出证据、趋势和显式修复建议，不自动修改、提交或部署代码。

## Capabilities

### New Capabilities

- `production-experience-canary`: 真实浏览器、移动断点、Logo 单一渲染与选项生成业务结果的发布验收。
- `ragas-retrieval-evaluation`: RAGAS 兼容的检索/回答质量数据集、指标、阈值、基线和 Langfuse score 关联。
- `langfuse-runtime-acceptance`: Langfuse 配置、trace/export、隐私、flush 和 eval 上传的可执行验收与故障状态。

### Modified Capabilities

- `turn-playability-guards`: 选项专用请求在开场无历史玩家动作时仍必须生成可玩选项，失败必须保留可关联诊断信息。
- `evaluation-regression-workflow`: 评测报告纳入 RAGAS 与真实产品 canary，发布门禁区分测试通过和产品就绪。

## Impact

- 主要影响 `src/app/play/page.tsx`、`src/app/api/chat/route.ts`、选项解析/UX、Logo/header 组件、`src/lib/observability/langfuse/*`、world knowledge eval 与脚本、E2E 和 OpenSpec。
- SSE/JSON：保持 `text/event-stream`、`__VERSECRAFT_STATUS__`、`__VERSECRAFT_FINAL__` 和旧 `options` 字段；只为 options-only 响应补充可选诊断字段。
- 状态/数据库：不建立新 store，不改变 `resolveDmTurn`、存档结构或 schema；评测产物写入 `.runtime-data`，Langfuse 只接收脱敏 metadata/score。
- Analytics：保留既有事件名和 payload；新增观测仅使用新的可选字段/本地健康报告。
- 性能：options-only 继续受现有 8.5 秒服务端预算和客户端 deadline 约束；Langfuse 导出与 RAGAS 全部异步或离线，不能阻塞在线首包/TTFT。
- 降级：Langfuse 不可用时主链路照常；RAGAS 缺少 live judge/embedding 凭据时产生明确 skipped/blocked 结果，不伪造通过。
- 非目标：不改成 agent 或 LangGraph 在线协商系统，不自动自修复代码，不重构主回合架构，不上传完整 prompt/narrative/player input。
