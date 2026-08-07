## 1. 配置与功能开关

- [ ] 1.1 在 `src/lib/config/serverConfig.ts` 中新增 `VERSECRAFT_ENABLE_LANGFUSE_READ`、`VERSECRAFT_LANGFUSE_READ_TIMEOUT_MS`、`VERSECRAFT_LANGFUSE_EVAL_ENABLED` 三个配置项，默认值分别为 `false`、`5000`、`false`
- [ ] 1.2 在 `.env.example` 中追加新环境变量说明
- [ ] 1.3 验证：运行 `pnpm lint` 确保配置导入路径正确

## 2. Langfuse 查询客户端

- [ ] 2.1 在 `src/lib/observability/langfuse/types.ts` 中追加 `TraceListItem`、`TraceDetail`、`ObservationNode`、`ScoreStats`、`QueryResult<T>` 类型定义
- [ ] 2.2 创建 `src/lib/observability/langfuse/queryClient.ts`，实现 `listTraces`、`getTrace`、`listObservations`、`listScores`、`getScoreStats`、`getMetricsDaily` 六个函数，全部 fail-open
- [ ] 2.3 在 `src/lib/observability/langfuse/index.ts` 中导出 queryClient 的公开 API
- [ ] 2.4 创建 `src/lib/observability/langfuse/queryClient.test.ts`，mock `@langfuse/client`，验证列表/详情/聚合/降级/超时场景
- [ ] 2.5 验证：运行 `pnpm jest queryClient` 或 equivalent test runner 确认测试通过

## 3. Admin API 端点

- [ ] 3.1 创建 `src/app/api/admin/langfuse/traces/route.ts`，实现 `GET` 分页 trace 列表
- [ ] 3.2 创建 `src/app/api/admin/langfuse/traces/[traceId]/route.ts`，实现 `GET` 单 trace 详情
- [ ] 3.3 创建 `src/app/api/admin/langfuse/scores/route.ts`，实现 `GET` score 聚合统计
- [ ] 3.4 创建 `src/app/api/admin/langfuse/observations/route.ts`，实现 `GET` 模型性能聚合
- [ ] 3.5 创建 `src/app/api/admin/langfuse/cost/route.ts`，实现 `GET` 成本拆解
- [ ] 3.6 创建 `src/app/api/admin/langfuse/health/route.ts`，实现 `GET` 健康检查
- [ ] 3.7 验证：运行 `pnpm test:e2e:contract` 确认现有契约测试通过，新增端点不破坏现有行为

## 4. Dashboard UI — Langfuse 可观测 Tab

- [ ] 4.1 在 `AdminDashboardV2.tsx` 的 `TABS` 数组中追加 `"Langfuse 可观测"`，`tabIcons` 中映射 `Activity` 图标
- [ ] 4.2 添加 `langfuseTraces`、`langfuseScores`、`langfuseObservations`、`langfuseCost`、`langfuseHealth` 五个 state 和对应的 `fetchEnvelope` 调用
- [ ] 4.3 实现「Trace 浏览器」子面板：搜索框 + 过滤器 + 分页表格 + 展开 trace detail 瀑布图
- [ ] 4.4 实现「Score 趋势」子面板：按 metric 分组的柱状图 + 时间范围选择器
- [ ] 4.5 实现「模型性能」子面板：按模型/角色分组的卡片
- [ ] 4.6 实现「成本仪表盘」子面板：成本分段柱状图 + 日趋势
- [ ] 4.7 实现「健康检查」子面板：连接状态 + ingestion 时间 + 错误计数
- [ ] 4.8 实现降级状态：Langfuse 不可用时各面板显示"数据不可用"提示而非空白
- [ ] 4.9 验证：使用 Playwright 在 `390×844`、`393×852`、`430×932` 视口下验证 Tab 渲染、搜索、分页、降级状态

## 5. Eval 体系 Langfuse 化

- [ ] 5.1 创建 `src/lib/evals/selfImprove/langfuseDataset.ts`，实现 scenario→dataset item 映射和 Langfuse dataset 创建/更新
- [ ] 5.2 创建 `src/lib/evals/selfImprove/langfuseExperiment.ts`，实现 dataset experiment 运行和 judge 评分上传
- [ ] 5.3 创建 `src/lib/evals/selfImprove/langfuseTraceUpload.ts`，实现 trace 批量上传（去重 + 分批）
- [ ] 5.4 修改 `orchestrator.ts`：在 game execution 后、judging 前新增 `uploadToLangfuse` 步骤，由 `--langfuse` CLI 标志控制
- [ ] 5.5 修改 `types.ts`：`SelfImproveTrace` 新增 `langfuseTraceId?` 和 `langfuseObservationId?` 字段
- [ ] 5.6 修改 `config.ts`：新增 `isLangfuseEvalEnabled()` 函数
- [ ] 5.7 在 `package.json` 中新增 `self-improve:run:langfuse`、`self-improve:dry-run:langfuse`、`self-improve:campaign:langfuse` 脚本
- [ ] 5.8 创建 `src/lib/evals/selfImprove/langfuseDataset.test.ts`，验证 scenario→dataset item 映射
- [ ] 5.9 验证：运行 `pnpm test` 确认 selfImprove 相关测试通过；本地 JSONL 读写行为不变

## 6. 交付验证

- [ ] 6.1 运行 `pnpm lint` 确保零错误
- [ ] 6.2 运行 `pnpm build` 确保编译通过
- [ ] 6.3 运行 `pnpm test:e2e:contract` 确认 `/api/chat` 契约测试全绿
- [ ] 6.4 确认无 `@langfuse/client` 类型泄漏到客户端组件
