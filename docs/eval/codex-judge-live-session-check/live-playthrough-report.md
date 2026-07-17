# Live Playthrough 小样本长程评测报告

> **生成时间**: 2026-07-17T02:15:58.553Z
> **模式**: live (真实 SUT)
> **会话数**: 1
> **总回合数**: 0
> **总耗时**: 60.0s
> **执行配方**: live_degraded
> **成本档位**: smoke
> **Judge 对账**: 0/1 会话有 mock↔live 双判

## 综合评分

| 指标 | 值 |
|---|---|
| 平均叙事分 | 5.00/5 |
| 通过会话 | 0/1 个有结论会话 |
| 未完成专项 | 0 |
| 平均回合数 | 0.0 |
| 平均会话耗时 | 60.0s |

### 统计置信度（通过会话）

- 通过率：0.0%
- 95% 置信区间：0.0% ~ 0.0%
- 区间宽度：0.0pp

### 维度平均分

| 维度 | 平均分 |
|---|---|
| coherence | 5.00 |
| characterVoice | 5.00 |
| plotLogic | 5.00 |
| immersion | 5.00 |
| factConsistency | 5.00 |

## 逐会话详情

### ❌ Session 1: happy-speedrun [speedrunner]

- **终止原因**: error
- **总回合数**: 0
- **耗时**: 60.0s
- **叙事评分**: 5/5
- **执行模式**: live_degraded（降级 1 回合）
- **裁判模式**: mock
- **证据状态**: fail
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
| 终止原因分布 | error |

## 结论与建议

⚠️ 1/1 个会话存在叙事一致性问题。
✅ 平均叙事分达到 4+，叙事质量良好。
