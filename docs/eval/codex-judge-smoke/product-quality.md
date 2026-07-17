# VerseCraft 产品质量证据报告

生成时间：2026-07-16T13:41:43.734Z
证据：1 个 run / 5 个回合；总体置信度 36%。

## 结论

当前质量点估计：87.9/100。该分数必须与置信度一起阅读。
- 证据门禁：token_evidence_incomplete
- 证据门禁：narrative_judge_confidence_low
- 证据门禁：overall_decision_confidence_low
- 产品决策门禁：human_playability_evidence_missing
- 产品决策门禁：playability_proxy_sample_too_small
- 产品决策门禁：counterfactual_choice_evidence_missing
- 产品决策门禁：conclusive_run_sample_too_small
- 产品决策门禁：turn_sample_too_small
- 降低重复叙事与无效回合。
- 优先修复行动未被明确响应的回合；自然语言能动性是核心体验。
- 把 provider token usage 写入匿名化逐回合 artifact，才能评价真实成本。

## 主观可玩性代理

启发式代理：—；置信度 0%；样本 0；评估者 0。
- actionPayoff: —
- tensionArc: —
- novelty: —
- choiceMeaning: —
- clarity: —
- continueDesire: —
- 限制：这是零成本启发式代理，不等同于真人主观评价。
- 限制：功能删除仍需要真人盲测或随机 A/B。
- 反事实选择对：0；结构化结果差异率：—

## 分维度评分

| 维度 | 分数 | 证据强度 | 依据 |
|---|---:|---|---|
| reliability | 100.0 | weak | conclusiveRuns=1；pass=100.0%；softlock=0.0%；error=0.0% |
| performance | 100.0 | weak | p50=0ms；p95=0ms |
| playability | 53.0 | weak | progression=0.6；agencyResponse=0；structuredConsequence=1；deadTurns=0；meaningfulChoice=1 |
| narrative | 92.5 | weak | judge=5/5；judgeConfidence=0.4；repetition=0.25；worldIssueTurns=0 |
| costEfficiency | — | missing | costEquivalent/turn=missing；contextTokens/turn=missing；profile=deepseek-v4-flash-usd-2026-07-13；coverage=0.0% |

## 功能证据

| 功能 | 触达 | 有效贡献 | 贡献率 | 当前决策 |
|---|---:|---:|---:|---|
| tasks | 0 | 0 | — | insufficient_evidence |
| weapons | 0 | 0 | — | insufficient_evidence |
| combat | 0 | 0 | — | insufficient_evidence |
| codex | 1 | 1 | 100.0% | insufficient_evidence |
| economy | 0 | 0 | — | insufficient_evidence |
| profession | 0 | 0 | — | insufficient_evidence |
| location | 3 | 2 | 66.7% | insufficient_evidence |

> 删除功能需要低使用、低贡献、低满意度和移除实验无伤害四类证据；本报告不会仅凭 trace 自动授权删除。

## Bug 与待复核告警

- 本批样本没有记录到 Bug 或 validator 告警。

## 回合成本与空转诊断

- 没有达到诊断阈值的回合。

缓存输入占比：—。

### Prompt 变体实验
- unknown_stable/unknown_runtime: 1 runs（有结论 1，未完成 0）；pass=100.0%；degraded=0.0%；avgInput=—
