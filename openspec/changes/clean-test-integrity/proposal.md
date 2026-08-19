## Why

最近的 live playthrough 产物出现了零回合/错误运行仍被 mock judge 评为 5/5、降级站点错误被当作正常剧情评分、mock 与 live 证据混合进入通过率等假绿问题。生成型报告还散落在 `docs/eval`、`.runtime-data` 和 benchmark 目录，既污染长期文档，也让历史失败证据与当前结论难以区分。

## What Changes

- 为 playthrough 结果引入明确证据状态：`pass`、`fail`、`inconclusive`、`infrastructure_failure`。
- 零步骤、错误、SSE 不完整、降级和基础设施失败运行不调用 judge，不产生分数或维度分。
- 只有完成的 `live_full` 且使用真实 live judge 的结果才进入 live 通过率与均分；mock 仅作为确定性回归证据。
- 加入空转录、错误、降级、mock judge、缺少 DM 必需字段等负向控制，确保不能形成 live pass。
- deep/holdout 使用显式场景矩阵，覆盖战斗、任务、死亡、伏笔、NPC 记忆、职业经济、边界、社交和多世界隔离。
- 生成结果默认写入 `.runtime-data/eval/<run-id>`，不再写入 `docs/eval`。
- 提供 manifest 驱动的产物 list/dry-run/delete；仅在成功终轮后删除生成型 trace/report，保留 fixtures、benchmark history、OpenSpec 与手写文档。

## Capabilities

### New Capabilities

- `test-integrity-gate`: 测评证据必须有可验证来源和结论资格；不可判定或基础设施失败不能被聚合成质量通过。
- `eval-artifact-lifecycle`: 生成型测评产物具有隔离输出、清理清单和终轮成功门槛。

## Impact

- 修改 playthrough runner、report renderer、judge 调用和相关 types/tests。
- 修改默认输出目录与深度场景选择。
- 新增只针对生成型评测产物的清理脚本和 package command。
- 不删除 `tests/promptfoo/tests/profession-rules.test.ts`；其现有真实断言继续保留。
- 不修改 `/api/chat`、SSE/DM JSON、数据库、认证或生产叙事行为；这些由独立运行时 change 管理。
