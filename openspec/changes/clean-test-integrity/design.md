## Context

当前 `scripts/eval-playthrough-live.ts` 对错误或零步骤运行仍构造 judge 结果，并在报告中渲染数值评分。mock 与 live judge 的 provenance 不足以阻止其污染 live 汇总；默认输出位于长期文档目录。近期报告因此同时出现“运行 error/零回合”和“5/5 无问题”。

## Goals / Non-Goals

**Goals:**
- 让每个结论都可追溯到 SUT profile、judge profile、完整 transcript 和协议完整性。
- 让错误、降级和不完整证据不可评分、不可通过、不可污染统计。
- 让场景覆盖与产物生命周期可复现、可审计。

**Non-Goals:**
- 不以 mock 替代 live。
- 不删除测试输入、rubric、benchmark history 或手写文档。
- 不修改线上回合裁决；由运行时 change 负责。

## Decisions

### D1: 证据与质量结论分离

每次运行先分类 evidence status，再决定是否可调用 judge。`judgeResult` 为 nullable；只有 transcript 非空、步骤完成、SSE/DM 完整且未降级的运行可评分。基础设施错误记录诊断，但不转译成剧情缺陷。

### D2: Live 汇总使用严格资格谓词

进入 live pass rate/average 的结果必须同时满足：`sutProfile=live_full`、`judgeProfile=live`、状态为 `pass|fail`、存在完整 transcript 和真实 judge result。mock、inconclusive、infrastructure failure 分栏展示，不进入分母。

### D3: 显式场景矩阵

deep/holdout 不再对选择结果做隐式 `slice`。CLI 接受显式 scenario ids；默认 deep 集合固定包含所有规定能力，未知或遗漏 id 直接失败。

### D4: 生成产物隔离与门控清理

默认 run id 由 UTC 时间和 profile 构成，输出到 `.runtime-data/eval/<run-id>`。清理器只读取版本化 manifest 中的允许 glob，拒绝越出仓库、拒绝匹配保留清单；默认 dry-run，只有显式 `--delete --terminal-success` 才删除。

## Risks / Trade-offs

- 真实通过率会低于旧报告；这是去除假绿后的预期结果。
- live judge 不可用会使终轮保持 `infrastructure_failure`，并阻止清理，确保失败证据不丢失。
- 历史生成产物中少量命名不规则文件需要在 manifest 中逐类列出，禁止使用宽泛的 `**/*report*`。
