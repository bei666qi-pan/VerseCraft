# Live Playthrough 小样本长程评测报告

> **生成时间**: 2026-08-12T10:17:54.318Z
> **模式**: live (真实 SUT)
> **玩家动作模式**: live
> **会话数**: 3
> **总回合数**: 0
> **总耗时**: 3.1s
> **执行配方**: live_degraded
> **成本档位**: standard
> **Judge 对账**: 0/3 会话有 mock↔live 双判

## 综合评分

| 指标 | 值 |
|---|---|
| 平均叙事分 | N/A（无 live judge 证据） |
| 通过会话 | 0/0 个有结论会话 |
| 未完成专项 | 3 |
| 平均回合数 | 0.0 |
| 平均会话耗时 | 1.0s |

- 当前样本不足，无法做通过率置信区间。

### 维度平均分

| 维度 | 平均分 |
|---|---|
| coherence | N/A |
| characterVoice | N/A |
| plotLogic | N/A |
| immersion | N/A |
| factConsistency | N/A |

## 逐会话详情

### ⚪ Session 1: happy-speedrun [speedrunner]

- **终止原因**: error
- **总回合数**: 0
- **耗时**: 1.0s
- **叙事评分**: 5/5
- **执行模式**: live_degraded（降级 1 回合）
- **裁判模式**: mock
- **证据状态**: inconclusive
- **玩法结果门禁**: 通过；observed={"tasks":0,"codex":0,"location":0,"weapons":0,"combat":0,"economy":0,"profession":0,"ending":0}
- **维度分**: {"coherence":5,"characterVoice":5,"plotLogic":5,"immersion":5,"factConsistency":5,"weaponConsistency":5,"professionConsistency":5}

#### 问题列表
- 无问题

#### 裁判推理
> 启发式裁判（v5）：0 个问题（0 critical, 0 major, 0 minor）。综合分 5/5。叙事重复率 0.0%，状态-叙事矛盾 0 处，原石-叙事不一致 0 处，武器不一致 0 处，职业不一致 0 处。

#### 回合记录


---

### ⚪ Session 2: happy-explore [explorer]

- **终止原因**: error
- **总回合数**: 0
- **耗时**: 0.0s
- **叙事评分**: 5/5
- **执行模式**: live_degraded（降级 1 回合）
- **裁判模式**: mock
- **证据状态**: inconclusive
- **玩法结果门禁**: 通过；observed={"tasks":0,"codex":0,"location":0,"weapons":0,"combat":0,"economy":0,"profession":0,"ending":0}
- **维度分**: {"coherence":5,"characterVoice":5,"plotLogic":5,"immersion":5,"factConsistency":5,"weaponConsistency":5,"professionConsistency":5}

#### 问题列表
- 无问题

#### 裁判推理
> 启发式裁判（v5）：0 个问题（0 critical, 0 major, 0 minor）。综合分 5/5。叙事重复率 0.0%，状态-叙事矛盾 0 处，原石-叙事不一致 0 处，武器不一致 0 处，职业不一致 0 处。

#### 回合记录


---

### ⚪ Session 3: refusal-prompt-injection [rulebreaker]

- **终止原因**: error
- **总回合数**: 0
- **耗时**: 2.1s
- **叙事评分**: 5/5
- **执行模式**: live_degraded（降级 1 回合）
- **裁判模式**: mock
- **证据状态**: inconclusive
- **玩法结果门禁**: 通过；observed={"tasks":0,"codex":0,"location":0,"weapons":0,"combat":0,"economy":0,"profession":0,"ending":0}
- **维度分**: {"coherence":5,"characterVoice":5,"plotLogic":5,"immersion":5,"factConsistency":5,"weaponConsistency":5,"professionConsistency":5}

#### 问题列表
- 无问题

#### 裁判推理
> 启发式裁判（v5）：0 个问题（0 critical, 0 major, 0 minor）。综合分 5/5。叙事重复率 0.0%，状态-叙事矛盾 0 处，原石-叙事不一致 0 处，武器不一致 0 处，职业不一致 0 处。

#### 回合记录


---

## 定性发现

### 性能统计

| 指标 | 值 |
|---|---|
| 平均单步延迟 | NaNms |
| p50 延迟 | 0ms |
| p95 延迟 | 0ms |
| 终止原因分布 | error, error, error |

## 结论与建议

⚠️ 3/3 个会话存在叙事一致性问题。
⚪ 当前没有可用于真实质量结论的 live judge 证据；请运行 model narrative review 或配置 live judge。
