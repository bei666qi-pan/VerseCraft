# VerseCraft 评测与回归 Campaign

这套工具用于发现、复现和报告玩法缺陷。它是一个确定性阶段式评测工作流，不是会自行修改项目代码的 Agent：

```text
场景构建 → 游戏执行 → 确定性 Oracle → 可选 Judge
        → 缺陷分诊 → 实施建议 → 质量门禁 → Holdout → 报告
```

评测器只写入 `.runtime-data/self-improve/` 下的运行证据。它不会启动 Codex/Claude writer，不会修改源码或测试，不会 commit、push、merge 或部署。

## 保留的能力

| 组件 | 路径 | 职责 |
| --- | --- | --- |
| Orchestrator | `src/lib/evals/selfImprove/orchestrator.ts` | 串联评测阶段并生成报告 |
| Scenario Pool | `src/lib/evals/selfImprove/scenarioPool.ts` | Golden、Regression、Replay、Boundary、Fuzz 场景 |
| Game Runner | `src/lib/evals/selfImprove/gameRunner.ts` | Mock 或真实 `/api/chat` 回合执行 |
| Deterministic Oracle | `src/lib/evals/selfImprove/orchestrator.ts` | 按结构化状态和 case invariant 判定 |
| Judge Ensemble | `src/lib/evals/selfImprove/judgeEnsemble.ts` | 玩法合法性、事实约束、可玩性辅助审查 |
| Defect Triage | `src/lib/evals/selfImprove/defectTriage.ts` | 签名、去重、证据和置信度仲裁 |
| Recommendation | `src/lib/evals/selfImprove/recommendation.ts` | 为显式实现任务生成根因、候选文件和验证建议 |
| Quality Gate | `src/lib/evals/selfImprove/qualityGate.ts` | 确定性、回归、E2E、Build 和 Live 门禁 |
| Strict Verifier | `src/lib/evals/selfImprove/strictVerifier.ts` | 独立检查证据是否足以得出严格结论 |

Judge 输出是候选证据，不会直接授权修改代码。网络、模型或证据不足必须标记 blocked/inconclusive，不能冒充产品缺陷或通过结果。

## 支持的命令

```bash
# 默认 Mock campaign；始终不修改仓库代码
pnpm eval:campaign -- --profile smoke

# Live campaign：先在另一终端启动 pnpm dev
pnpm eval:campaign -- --live --profile smoke --max-rounds 3

# 建立当前基线
pnpm eval:baseline

# 查看历史报告
pnpm eval:report -- --run-id <runId>

# 严格验证某次运行证据
pnpm eval:verify:strict -- --run-id <runId>
```

保留的 `self-improve:run`、`self-improve:campaign`、`self-improve:baseline`、`self-improve:report` 和 `self-improve:verify:strict` 仅为兼容别名，行为同样是非写入评测。`--dry-run` 也是兼容 no-op，因为所有 campaign 现在都不修改仓库。

已退役：

- `self-improve:supervise`
- `self-improve:calibration`
- `--repair-backend`
- `verse -ds` 后台自修复 daemon
- AutoOps 本地 Agent 自动改码、commit 和 push main

## Mock 与 Live

Mock 适合快速回归和场景开发，使用 fixture DM JSON 与确定性/启发式 Judge，不证明真实模型质量。

Live 调用真实 `/api/chat` SSE 和已配置的 AI Gateway。只有具备完整来源、解析成功、足够覆盖率和严格门禁证据的结果，才能计为真实模型通过；超时、凭证缺失或低置信度必须保持 inconclusive/blocked。

```bash
pnpm dev
# 另一终端
SI_LIVE_MODE=1 pnpm eval:campaign -- --profile smoke
```

## 从报告到修复

评测发现缺陷后的标准流程是：

1. 查看 `deterministic-results.json`、trace 和报告中的 case/invariant 证据。
2. 明确开启一个实现任务；不要让评测进程自行写代码。
3. 先新增能复现问题的失败回归测试。
4. 修改现有权威 guard、validator、packet 或 commit 路径。
5. 跑相关测试和保活测试。
6. 重新运行 `pnpm eval:campaign` 验证缺陷消失且没有回归。

若缺陷涉及产品规则选择、Judge 分歧或无法确定性复现，应进入人工评审，不生成伪确定性的代码修改。

## 产物与兼容

运行产物仍保存在 `.runtime-data/self-improve/<runId>/`，包括：

- `manifest.json`
- `state.json`
- `traces.jsonl`
- `deterministic-results.json`
- `holdout-results.json`
- `final-report.json` / `final-report.md`
- `campaign-report.json` / `campaign-report.md`

历史运行产物不迁移、不删除。内部目录与部分类型仍使用 `selfImprove` 历史名称，以避免无收益的大规模 import 迁移。

## 与另外两个循环的区别

- 在线 `DM Agent` 是默认关闭、最多 2～3 轮、带总时限和工具校验的回合工具调用，不是代码自修复。
- `deploy-selfheal.mjs` 只判断 Coolify 失败是否为瞬时基础设施问题并有限重试；遇到代码/配置问题会停止并留下 incident，不会修改仓库。
