## Context

线上复现证明：开场 options-only 请求只有 assistant 历史，`validateChatRequest` 先按普通玩家回合要求非空 user action，返回 `player action is empty`；带一条 user 元请求的相同请求可在约 4 秒返回四个模型选项。客户端把失败终帧压成无诊断的空状态。Langfuse adapter、tracing、score 代码已经存在，但没有可靠的配置/导出验收，OpenSpec 任务状态也与代码事实不一致。world knowledge 现有 benchmark 是自定义指标，不是 RAGAS 兼容评测。

## Goals / Non-Goals

**Goals:**

- 修复开场和普通回合的 options-only 请求，并让失败可关联、可重试。
- 用一个真实浏览器 canary 证明 Logo 单一渲染和选项业务结果，而不只证明页面/HTTP 存活。
- 将 RAGAS 指标作为离线评测阶段，输出本地 artifact 并可选上传 Langfuse score。
- 让 Langfuse 有可执行 preflight、trace/export/flush 验收和明确的 disabled/misconfigured/healthy 状态。

**Non-Goals:**

- 不把 RAGAS、Langfuse 或 evaluator 放入在线回合关键路径。
- 不自动改代码、提交或部署，不替换现有 PostgreSQL analytics。
- 不改变 DM 状态真相源、存档/schema 或现有视觉方向。

## Decisions

### 1. options-only 同时做客户端元请求与服务端语义分流

客户端在没有历史 user 消息时附加固定、非世界行动的 user 元请求；服务端在识别 header/body 均为 `options_regen_only` 后允许没有玩家行动的有效请求，并用 `clientReason/optionsRegenContext` 构建 packet。双层处理兼容已部署的旧服务端/旧客户端。普通空输入仍按原契约拒绝。

替代方案是仅放宽所有空输入校验；这会削弱普通回合安全契约，因此拒绝。

### 2. options-only 保持现有 SSE 兼容格式

成功继续返回 status 帧和 JSON payload；失败 payload 增加可选 `request_id`、`trace_id` 与有界 `debug_reason_codes`。客户端只显示短 request ID 和“重试/直接输入”操作，不显示内部 provider、prompt 或原文。主 DM 终帧契约不变。

### 3. Logo 用“一个品牌位一个 mark”作为可测契约

品牌 mark 添加明确 test id，header 同一品牌组只允许一个 mark。`VerseCraftLogoMark` 内部只允许一个 SVG；视觉截图作为补充，DOM 计数是主断言。星芒不再作为 wordmark 后的第二个装饰 Logo；底部功能图标不计为品牌位。

### 4. RAGAS 采用 TypeScript 的兼容实现层

不引入 Python sidecar。评测数据结构遵循 RAGAS 的 `question/answer/contexts/ground_truth`，规则可计算的 context precision/recall 本地确定性计算；faithfulness/answer relevancy 通过现有受控 judge/embedding 入口计算。没有凭据时明确标记 unavailable，绝不以 mock 结果冒充 live。指标命名为 `ragas.context_precision` 等，便于 Langfuse 聚合。

### 5. Langfuse 验收与在线导出分离

`langfuse:preflight` 只验证 feature flag、keys、base URL、salt 和 SDK；显式 integration probe 创建测试 trace/score、flush 并查询/确认导出结果。在线 tracing 始终 fail-open、采样且不捕获内容；options-only trace 必须在所有 return 路径结束。

### 6. 产品就绪门禁以真实业务断言为准

canary 在 production preview 和 `versecraft.cn` 上执行开场→展开选项，断言 2–4 个可点击选项、无错误 overlay/console error、SSE request ID 存在、Logo 品牌位计数正确，并在三个移动 viewport 保存截图。HTTP 200 或通用 DM JSON 只算契约存活，不算产品就绪。

## Risks / Trade-offs

- [RAGAS 指标与官方 Python 实现存在数值差异] → 固定数据格式、公式版本和 golden cases，报告标注 `ragas-compatible` 与版本。
- [Langfuse 凭据或出口网络不可用] → preflight 明确 failed/skipped；主链路 fail-open，但发布验收不能伪报成功。
- [生产 canary 消耗模型额度] → 使用单一低频 options-only 场景、稳定 session 前缀和严格预算。
- [双保险导致旧客户端行为差异] → 保持 header/body 一致性校验，只有明确 options-only 才分流。
- [Logo 误判功能图标] → DOM 契约只统计 `data-testid=versecraft-brand-mark` 所在品牌容器。

## Migration Plan

1. 先发布兼容的服务端 options-only 分流与观测字段；旧客户端继续工作。
2. 发布客户端元请求、可诊断失败 UI 与单一 Logo；本地 preview 和线上 canary 验证。
3. 以 100% 本地/测试环境验证 Langfuse probe，再按采样率灰度生产。
4. RAGAS 先作为报告项运行，建立基线后再启用 strict threshold。
5. 回滚时可单独关闭 Langfuse/RAGAS 门禁；options-only 修复保持向后兼容，无数据迁移。

## Open Questions

- 生产 Langfuse 项目是否已配置有效 keys 和可访问 base URL，只能由 preflight/integration probe 给出事实结果。
- Logo “重影”是否还包含特定设备的 GPU/缩放栅格问题；DOM 修复后用三个 viewport 截图确认。
