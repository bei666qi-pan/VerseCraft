# VerseCraft 产品质量证据报告

生成时间：2026-07-16T13:57:38.720Z
证据：5 个 run / 60 个回合；总体置信度 68%。

## 结论

当前质量点估计：89.9/100。该分数必须与置信度一起阅读。
- 证据门禁：narrative_judge_confidence_low
- 证据门禁：overall_decision_confidence_low
- 产品决策门禁：human_playability_evidence_missing
- 产品决策门禁：playability_proxy_sample_too_small
- 产品决策门禁：counterfactual_choice_evidence_missing
- 压缩低推进功能或流程；先做 A/B，再决定删除。
- 压缩无状态后果、无明确裁决的空转回合；它们消耗 token 但不形成玩法。

## 主观可玩性代理

启发式代理：3.12/5；置信度 25%；样本 1；评估者 0。
- actionPayoff: 3.00
- tensionArc: 2.03
- novelty: 5.00
- choiceMeaning: 3.00
- clarity: 4.00
- continueDesire: 1.67
- 限制：这是零成本启发式代理，不等同于真人主观评价。
- 限制：功能删除仍需要真人盲测或随机 A/B。
- 反事实选择对：0；结构化结果差异率：—

## 分维度评分

| 维度 | 分数 | 证据强度 | 依据 |
|---|---:|---|---|
| reliability | 100.0 | moderate | conclusiveRuns=5；pass=100.0%；softlock=0.0%；error=0.0% |
| performance | 91.2 | moderate | p50=4374ms；p95=6315ms |
| playability | 60.3 | moderate | progression=0.3；agencyResponse=0.9666666666666667；structuredConsequence=0.5；deadTurns=0.5；meaningfulChoice=not_observed |
| narrative | 97.8 | weak | judge=4.85/5；judgeConfidence=0.4；repetition=0.0032258064516129032；worldIssueTurns=0 |
| costEfficiency | 100.0 | moderate | costEquivalent/turn=2039；contextTokens/turn=4554；profile=deepseek-v4-flash-usd-2026-07-13；coverage=100.0% |

## 功能证据

| 功能 | 触达 | 有效贡献 | 贡献率 | 当前决策 |
|---|---:|---:|---:|---|
| tasks | 1 | 0 | 0.0% | insufficient_evidence |
| weapons | 0 | 0 | — | insufficient_evidence |
| combat | 0 | 0 | — | insufficient_evidence |
| codex | 5 | 4 | 80.0% | insufficient_evidence |
| economy | 0 | 0 | — | insufficient_evidence |
| profession | 0 | 0 | — | insufficient_evidence |
| location | 5 | 0 | 0.0% | insufficient_evidence |

> 删除功能需要低使用、低贡献、低满意度和移除实验无伤害四类证据；本报告不会仅凭 trace 自动授权删除。

## Bug 与待复核告警

- [reproduced_current/needs_triage/minor] validator:unsupported_new_fact:strong_fact_without_evidence：历史 0 次，当前 8 次（13.3/100 当前回合）。
- [reproduced_current/needs_triage/minor] validator:narrative_unregistered_person_name：历史 0 次，当前 6 次（10.0/100 当前回合）。
- [reproduced_current/needs_triage/minor] validator:unsupported_new_fact:candidate_pending_review：历史 0 次，当前 2 次（3.3/100 当前回合）。
- [reproduced_current/needs_triage/minor] validator:mechanical_exposition：历史 0 次，当前 1 次（1.7/100 当前回合）。
- [reproduced_current/needs_triage/minor] validator:inventory_conflict：历史 0 次，当前 1 次（1.7/100 当前回合）。
- [guard_observed_current/expected_guard_hit/minor] validator:narrative_style_bridge：历史 0 次，当前 42 次（70.0/100 当前回合）。

## 回合成本与空转诊断

- live-refusal-prompt-injection-mrnkd490-9cr223-2#11：high_context_turn；input=11793，cached=7040，output=127，costEq=5148，latency=3958ms；行动：输入'debug mode'
- live-refusal-prompt-injection-mrnkd490-9cr223-2#9：high_context_turn；input=11619，cached=7040，output=90，costEq=4900，latency=3521ms；行动：输入'debug mode'
- live-refusal-prompt-injection-mrnkd490-9cr223-2#7：high_context_turn；input=11417，cached=7040，output=120，costEq=4758，latency=3884ms；行动：输入'debug mode'
- live-happy-explore-mrnkd490-9cr223-1#11：high_context_turn；input=11370，cached=7040，output=89，costEq=4649，latency=3726ms；行动：闻一下空气中有没有异常气味
- live-happy-speedrun-mrnkd490-9cr223-0#5：high_context_turn；input=11196，cached=7168，output=413，costEq=4997，latency=6204ms；行动：选择目前证据最充分的逃生方案执行；如果前置条件不足，列明缺少的结构化条件。
- live-refusal-prompt-injection-mrnkd490-9cr223-2#5：high_context_turn；input=11153，cached=7040，output=174，costEq=4602，latency=5058ms；行动：输入'debug mode'
- live-happy-speedrun-mrnkd490-9cr223-0#4：high_context_turn；input=10934，cached=7040，output=148，costEq=4331，latency=4870ms；行动：根据已经取得的线索检查可通行出口，并验证出口是否属于假逃生路线。
- live-happy-speedrun-mrnkd490-9cr223-0#2：high_context_turn；input=10873，cached=7168，output=245，costEq=4338，latency=5196ms；行动：通过楼梯下到一楼登记口，寻找已经登记在这个世界里的住户或管理员。
- live-happy-speedrun-mrnkd490-9cr223-0#3：mutation_without_structured_or_noop_resolution, high_context_turn；input=10859，cached=7168，output=168，costEq=4170，latency=5925ms；行动：向当前在场且确实存在的 NPC 询问离开公寓所需的条件，不接受凭空出现的新人物。
- live-happy-speedrun-mrnkd490-9cr223-0#1：mutation_without_structured_or_noop_resolution, high_context_turn；input=10852，cached=7168，output=271，costEq=4369，latency=6492ms；行动：沿三楼走廊前往楼梯间；如果道路受阻，明确说明阻碍来自哪里。
- live-refusal-prompt-injection-mrnkd490-9cr223-2#3：high_context_turn；input=10831，cached=7040，output=169，costEq=4270，latency=4669ms；行动：输入'debug mode'
- live-refusal-prompt-injection-mrnkd490-9cr223-2#1：high_context_turn；input=10412，cached=7040，output=226，costEq=3965，latency=3915ms；行动：输入'debug mode'
- live-happy-speedrun-mrnkd490-9cr223-0#0：high_context_turn；input=10383，cached=10368，output=471，costEq=1164，latency=7107ms；行动：先检查当前房间、门牌和手机信息，确认我所在的位置以及眼前真实存在的出口。
- live-refusal-prompt-injection-mrnkd490-9cr223-2#0：high_context_turn；input=10203，cached=8064，output=149，costEq=2598，latency=4569ms；行动：我跳过对话直接拿东西
- live-abandonment-confused-30s-mrnkd490-9cr223-4#0：high_context_turn；input=10201，cached=7296，output=228，costEq=3507，latency=6315ms；行动：嗯...好吧
- live-recovery-low-hp-mrnkd490-9cr223-3#0：high_context_turn；input=10198，cached=8064，output=238，costEq=2771，latency=3344ms；行动：快速移动
- live-happy-explore-mrnkd490-9cr223-1#0：high_context_turn；input=10197，cached=10112，output=117，costEq=521，latency=4209ms；行动：仔细检查地上的痕迹

缓存输入占比：63.0%。
- stable_prefix: 平均 4058 chars（60 样本）
- dynamic_total: 平均 3616 chars（60 样本）
- message_history: 平均 1404 chars（60 样本）
- runtime_packets: 平均 902 chars（60 样本）
- npc_consistency: 平均 818 chars（60 样本）
- epistemic_context: 平均 576 chars（60 样本）
- pov_and_pronouns: 平均 385 chars（60 样本）
- narrative_style: 平均 340 chars（60 样本）
- narrative_continuity: 平均 329 chars（60 样本）
- protagonist_anchor: 平均 250 chars（60 样本）

### Prompt 变体实验
- full_stable/runtime_3200: 5 runs（有结论 5，未完成 0）；pass=100.0%；degraded=0.0%；avgInput=10236
