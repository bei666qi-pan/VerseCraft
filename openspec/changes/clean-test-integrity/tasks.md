## 1. 证据模型与裁判资格

- [x] 1.1 为 playthrough result 增加四态 evidence status、nullable judge result 和 SUT/judge provenance
- [x] 1.2 在 judge 调用前拒绝零步骤、错误、不完整 SSE/DM 和降级 transcript
- [x] 1.3 让 report renderer 对不可评分结果只展示状态与原因，不展示分数、维度或通过结论
- [x] 1.4 让聚合只统计完成的 `live_full + live judge` 结果，并单列 mock/inconclusive/infrastructure failure

## 2. 负向控制与覆盖矩阵

- [x] 2.1 增加空转录、错误运行、降级终帧、缺失 DM 字段和 mock judge 不可形成 live pass 的测试
- [x] 2.2 移除 deep 默认场景的隐式截断，定义覆盖全部规定能力的显式场景矩阵
- [x] 2.3 校验未知、重复或缺失必需场景时 runner 在执行前失败

## 3. 输出与清理生命周期

- [x] 3.1 将生成型 eval 默认输出改为 `.runtime-data/eval/<run-id>`
- [x] 3.2 新增版本化产物 manifest 与 list/dry-run/delete 清理命令，包含路径越界和保留清单保护
- [x] 3.3 增加清理器测试，覆盖历史 trace/report、benchmark report、RAG/DeepEval/playtest 报告及必须保留的数据源

## 4. 验证与证据

- [x] 4.1 运行 eval integrity、playthrough、judge 和 cleanup 定向测试（原定向套件 215 tests passed；新增产物隔离/清理测试 6/6；cleanup dry-run 识别 467 个候选且未删除；r19/r20 follow-up 组合回归 166/166）
- [x] 4.2 运行 mock 场景矩阵，确认无 false-green（combat 18/18、NPC 8/8、narrative safety 119/119 且十维均为 1.000/severe=0、deep 10/10；mock 明确不进入 live 均分）
- [x] 4.3 运行 lint、完整 unit、quick gate 和 build，并记录真实结果（显式 full unit: node 3945/3945 + Vitest 295/295；promptfoo 172/172；产物迁移后 quick gate 再次 4 pass/0 fail；lint 0 errors/120 warnings；build passed；E2E contract 5 passed/6 conditional skipped；chat mock benchmark 10/10，p95 status/text/final=47/141/442ms）
- [ ] 4.4 终轮 live 成功后执行清理和无产物复验；若基础设施失败则保留证据并记录 blocker
  - 2026-08-14 blocker：`.runtime-data/eval/playthrough-live-speedrun-rerun-3/live-playthrough-report.md` 为 `live_degraded + infrastructure_failure`，judge=`none`、数值评分均为 N/A；托管 Writer 返回 HTTP 402 `Insufficient Balance`，因此未执行删除。
  - 2026-08-15 blocker：`.runtime-data/eval/terminal-live-smoke-2x8-20260815-r19/live-playthrough-report.md` 的 speedrun 在第 6 回合收到 `site_fallback/server_internal_generation_failed`，explorer 在第 4 次请求因 `stream_idle_timeout_12000ms` 最终耗时约 70 秒并由客户端中止；两会话均为 `live_degraded + infrastructure_failure`，judge=`none`、无数值评分。证据已保留，未运行 deep/holdout，未执行删除。
  - 2026-08-15 复测 blocker：`.runtime-data/eval/terminal-live-smoke-2x8-20260815-r20/live-playthrough-report.md` 的两会话分别在第 5/4 次请求前中止；服务日志两次显示上游首字约 1.1–1.2 秒，但 `stream_hard_cap_15000ms` 实际约 42–43 秒才执行。两会话均为 `live_degraded + infrastructure_failure`，judge=`none`、无数值评分；因此仍不运行 deep/holdout 或清理。
