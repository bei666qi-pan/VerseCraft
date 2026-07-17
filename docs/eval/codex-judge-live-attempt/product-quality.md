# VerseCraft 产品质量证据报告

生成时间：2026-07-16T13:42:25.768Z
证据：1 个 run / 2 个回合；总体置信度 24%。

## 结论

当前质量点估计：证据不足，暂不评分。该分数必须与置信度一起阅读。
- 证据门禁：token_evidence_incomplete
- 证据门禁：agency_response_evidence_missing
- 证据门禁：narrative_judge_evidence_missing
- 证据门禁：narrative_judge_confidence_low
- 证据门禁：overall_score_withheld_incomplete_core_evidence
- 证据门禁：overall_decision_confidence_low
- 产品决策门禁：human_playability_evidence_missing
- 产品决策门禁：playability_proxy_sample_too_small
- 产品决策门禁：counterfactual_choice_evidence_missing
- 产品决策门禁：conclusive_run_sample_too_small
- 产品决策门禁：turn_sample_too_small
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
| reliability | 15.0 | weak | conclusiveRuns=1；pass=0.0%；softlock=0.0%；error=100.0% |
| performance | 75.7 | weak | p50=4262ms；p95=8648ms |
| playability | — | missing | progression=0.5；agencyResponse=missing；structuredConsequence=1；deadTurns=0；meaningfulChoice=not_observed |
| narrative | — | missing | judge=missing/5；judgeConfidence=0.4；repetition=0；worldIssueTurns=0 |
| costEfficiency | 100.0 | weak | costEquivalent/turn=982；contextTokens/turn=10763；profile=deepseek-v4-flash-usd-2026-07-13；coverage=50.0% |

## 功能证据

| 功能 | 触达 | 有效贡献 | 贡献率 | 当前决策 |
|---|---:|---:|---:|---|
| tasks | 0 | 0 | — | insufficient_evidence |
| weapons | 0 | 0 | — | insufficient_evidence |
| combat | 0 | 0 | — | insufficient_evidence |
| codex | 1 | 1 | 100.0% | insufficient_evidence |
| economy | 0 | 0 | — | insufficient_evidence |
| profession | 0 | 0 | — | insufficient_evidence |
| location | 1 | 0 | 0.0% | insufficient_evidence |

> 删除功能需要低使用、低贡献、低满意度和移除实验无伤害四类证据；本报告不会仅凭 trace 自动授权删除。

## Bug 与待复核告警

- [reproduced_current/confirmed/critical] dependency:live_generation_unavailable：历史 0 次，当前 1 次（50.0/100 当前回合）。
- [reproduced_current/needs_triage/minor] validator:unsupported_new_fact:candidate_pending_review：历史 0 次，当前 1 次（50.0/100 当前回合）。
- [reproduced_current/needs_triage/minor] validator:narrative_unregistered_person_name：历史 0 次，当前 1 次（50.0/100 当前回合）。
- [guard_observed_current/expected_guard_hit/minor] validator:narrative_style_bridge：历史 0 次，当前 1 次（50.0/100 当前回合）。

## 回合成本与空转诊断

- live-happy-speedrun-mrnk5xg3-kblaif-0#0：high_context_turn；input=10383，cached=10368，output=380，costEq=982，latency=8648ms；行动：先检查当前房间、门牌和手机信息，确认我所在的位置以及眼前真实存在的出口。

缓存输入占比：99.9%。
- dynamic_total: 平均 11147 chars（1 样本）
- stable_prefix: 平均 10976 chars（1 样本）
- runtime_packets: 平均 3179 chars（1 样本）
- npc_consistency: 平均 1471 chars（1 样本）
- narrative_style: 平均 1200 chars（1 样本）
- epistemic_context: 平均 913 chars（1 样本）
- protagonist_anchor: 平均 873 chars（1 样本）
- turn_mode_policy: 平均 860 chars（1 样本）
- fact_audit: 平均 821 chars（1 样本）
- narrative_continuity: 平均 520 chars（1 样本）

### Prompt 变体实验
- full_stable/runtime_3200: 1 runs（有结论 1，未完成 0）；pass=0.0%；degraded=100.0%；avgInput=10383
