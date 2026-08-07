## Context

当前 Langfuse 在 VerseCraft 中仅作"只写"用途：通过 `src/lib/observability/langfuse/` 下的 tracing、generation、scores 模块上报数据到 Langfuse 实例。管理后台 `AdminDashboardV2` 有 9 个 Tab，覆盖用户、AI 体验、内容质量等维度，但无可观测性面板。selfImprove Eval 体系将 trace 存储在本地 `.runtime-data/self-improve/<runId>/traces.jsonl`，评分结果在本地分析，缺乏集中检索与对比能力。

`@langfuse/client`（v5.10.0）已在 `package.json` 中，当前仅用于 `scores.ts` 中的 score 写入。其 REST API 客户端同样支持读取 trace、observations、scores、metrics 等数据。

## Goals / Non-Goals

**Goals:**
- 为 Admin Dashboard 提供 Langfuse trace/score/模型性能/成本的可读查询链路
- 所有查询链路 fail-open：Langfuse 不可用时 Dashboard 仍可渲染，显示降级状态
- selfImprove Eval 体系可选上传 trace + 评分到 Langfuse datasets/experiments
- 新增能力受独立功能开关控制，与现有 Langfuse 写入端完全解耦

**Non-Goals:**
- 不在 `/api/chat` 热路径上增加任何 Langfuse 读操作
- 不实现实时 WebSocket 推送（Dashboard 使用轮询刷新）
- 不删除本地 JSONL trace 存储
- 不引入图表库（纯 CSS/Tailwind 实现可视化）
- 不修改现有 Langfuse 写入端 sampling 逻辑

## Decisions

### D1: 查询客户端架构 — 薄封装 `@langfuse/client` 的 REST API

**选择**：在 `src/lib/observability/langfuse/queryClient.ts` 中直接使用 `@langfuse/client` 的 `LangfuseClient` 实例调用 REST API。

**替代方案**：
- 直接调用 Langfuse REST API（`fetch`）：无类型安全，重复造轮子
- 使用 `@langfuse/core`：更底层，增加维护负担

**理由**：`@langfuse/client` 已在依赖中，提供类型化的 API 方法（`client.trace.list()`、`client.score.list()` 等），直接复用即可。

### D2: Admin API 端点路由 — `/api/admin/langfuse/*` 统一前缀

**选择**：所有 Langfuse 读取端点放在统一前缀 `/api/admin/langfuse/` 下，与现有 `/api/admin/*` 端点共享 `verifyAdminRequest` 保护。

**替代方案**：
- 放在 `/api/langfuse/*`：需要额外认证逻辑，增加安全面
- 通过 Server Actions 直接读取：无法利用 HTTP 缓存头、分页游标等 REST 惯用模式

**理由**：统一前缀 + 统一认证 = 最小安全面。与现有 admin 端点风格一致。

### D3: Dashboard 可视化 — 纯 CSS/Tailwind 无图表库

**选择**：使用 Tailwind CSS 的柱状图（`div` + 动态 `height`）+ 数字卡片 + 表格实现所有可视化。

**理由**：
- 不引入额外依赖（Recharts、Chart.js 等）
- 与现有 AdminDashboardV2 的 UI 风格完全一致
- 对运维场景足够清晰（数字比图表更具可操作性）
- 减少 bundle size

### D4: 双轨 eval 策略 — `--langfuse` 标志 + 本地 JSONL 不删

**选择**：selfImprove CLI 新增 `--langfuse` 标志，启用后将 trace 和评分上传到 Langfuse；未启用时行为不变（本地 JSONL 存储）。

**理由**：
- 向后兼容：现有 `pnpm self-improve:*` 脚本行为不变
- 渐进迁移：可先验证 Langfuse 链路再逐步切换
- 本地 JSONL 作为 fallback 保留

### D5: 功能开关独立解耦

**选择**：三个新环境变量与现有 Langfuse 开关完全独立：
- `VERSECRAFT_ENABLE_LANGFUSE_READ`（Dashboard 读取，默认 `false`）
- `VERSECRAFT_LANGFUSE_READ_TIMEOUT_MS`（查询超时，默认 `5000`）
- `VERSECRAFT_LANGFUSE_EVAL_ENABLED`（Eval 上传，默认 `false`）

**理由**：
- Dashboard 读取与后端写入互不影响
- 可独立灰度各个模块
- 超时配置独立于写入端 flush 超时

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| Langfuse API 容量/速率限制：Dashboard 高并发查询可能触发限流 | 所有端点返回 `Cache-Control` 头；Dashboard 端按需加载（切换 Tab 时拉取） |
| `@langfuse/client` API 变更：v5→v6 可能修改方法签名 | 封装在 `queryClient.ts` 内，仅暴露自有类型接口 |
| Eval trace 上传体积大：批量上传可能超时 | `langfuseTraceUpload.ts` 分批上传 + 去重；超时不阻塞主流程 |
| Dashboard 数据与 Langfuse 实际状态不一致（轮询延迟） | 显示 `updatedAt` 时间戳 + 手动刷新按钮；不冒充实时数据 |

## Migration Plan

1. **部署前**：在 `.env` 中配置 `VERSECRAFT_ENABLE_LANGFUSE_READ=1` + 有效的 `LANGFUSE_PUBLIC_KEY`/`LANGFUSE_SECRET_KEY`/`LANGFUSE_BASE_URL`
2. **部署**：新增代码无破坏性变更，现有 9 个 Tab 和数据源完全不变
3. **验证**：访问 `/saiduhsa` → 切换到「Langfuse 可观测」Tab → 确认各面板数据正常
4. **Eval 迁移**：运行 `pnpm self-improve:run:langfuse --dry-run` 验证上传链路
5. **回滚**：设置 `VERSECRAFT_ENABLE_LANGFUSE_READ=0` 即可关闭 Dashboard 数据源（Tab 仍可见，显示降级状态）；设置 `VERSECRAFT_LANGFUSE_EVAL_ENABLED=0` 关闭 eval 上传

## Open Questions

- Langfuse self-hosted vs cloud 实例的 base URL 配置是否统一？→ 由 `LANGFUSE_BASE_URL` 决定，无差异
- Dashboard 数据刷新频率？→ 暂不实现自动轮询，依赖 Tab 切换时拉取 + 手动刷新按钮
