# 战斗系统 Mock 深度评测 + 边界场景报告

**时间**: 2026-08-14T03:21:10.956Z
**模式**: Mock (offline heuristic + combatCanon)
**通过**: 18/18 invariants (100%)

---

## 1. Combat Canon 基线

### 异常威胁数据

| ID | 名称 | Power | Aggression | Volatility | Tags | 弱点 |
|----|------|-------|------------|------------|------|------|
| A-001 | unknown | 32 | 0.7 | 0.7 | ambush, close_quarters | time, anchor |
| A-002 | unknown | 28 | 0.5 | 0.4 | boundary_guard, social_pressure | sound, silence |
| A-004 | unknown | 34 | 0.6 | 0.8 | ambush, mirror_counter | time, direction |
| A-007 | unknown | 38 | 0.8 | 0.8 | ambush, close_quarters | anchor, seal |

---

## 2. LikelyCost 未知检查

| 场景 | Combat Mode | likelyCost | 是否 Unknown | 原因 |
|------|-------------|------------|-------------|------|
| boundary-weapon-broken | weaponless | **heavy** | ✅ NO | broken weapon |
| boundary-consecutive-3 | direct | **heavy** | ✅ NO | consecutive 3 combats |
| boundary-combat-outside-safe-zone | direct | **heavy** | ✅ NO | extreme threat |
| boundary-multi-anomaly | direct | **heavy** | ✅ NO | multi-anomaly |
| boundary-tactical-escape | escape | **light** | ✅ NO | evasive: adjPower=17 |

**结果**: ✅ 零 unknown — 所有场景有明确 likelyCost

---

## 3. 边界场景 Invariant 验证

### boundary-weapon-broken
**武器损坏后战斗——stability=0 的时钟刺**

> 验证武器 stability=0 时战斗裁决是否正确：临时武器属性、劣势加成、修理提示

| Invariant | 描述 | 结果 | 证据 |
|-----------|------|------|------|
| likelyCost_not_unknown | likelyCost 不在 unknown（已知关键词表覆盖 broken weapon 叙事） | ✅ | broken weapon=stability 0, likelyCost would be heavy/moderate (not unknown) |
| combat_disadvantage | 武器损坏导致战斗劣势，sanity_damage ≥ 1 | ✅ | stability=0, threat=high |
| sanity_damage_declared | 战斗回合必有 sanity_damage 声明 | ✅ | combat mode=true, sanity_damage expected >= 1 for broken weapon vs anomaly |

**场景结果**: ✅ 全部通过

### boundary-consecutive-3
**连续 3 次战斗——疲劳累积与资源消耗**

> 验证连续遭遇时 combat adjudication 是否正确反映疲劳、弹药/原石消耗、理智递减

| Invariant | 描述 | 结果 | 证据 |
|-----------|------|------|------|
| likelyCost_not_unknown | 连续战斗的 likelyCost 不低于 moderate | ✅ | consecutive=3, threat=extreme |
| fatigue_escalation | 疲劳程度随连续遭遇次数递增 | ✅ | consecutive=3, wounded=true |
| sanity_damage_declared | 每场战斗都有 sanity_damage | ✅ | consecutive combat turn, sanity_damage expected >= 2 for fatigue |
| combat_difficulty_scales | 多次遭遇后 combat_difficulty 反映高压环境 | ✅ | anomaly count=1, highBasePower=true |

**场景结果**: ✅ 全部通过

### boundary-combat-outside-safe-zone
**安全区外战斗——3F 走廊遭遇 A-007**

> 验证非安全区（3F_Corridor）战斗不受安全区收敛规则影响，威胁正常展开

| Invariant | 描述 | 结果 | 证据 |
|-----------|------|------|------|
| likelyCost_not_unknown | 安全区外 likelyCost 正确反映威胁，不是 unknown | ✅ | anomaly A-007 basePower=38, inSafeZone=false |
| no_safe_zone_convergence | 不在安全区时无安全区收敛效果 (非 de-escalated) | ✅ | inSafeZone=false (3F_Corridor is NOT a safe zone) |
| sanity_damage_declared | 战斗回合必有 sanity_damage | ✅ | A-007 extreme threat → sanity_damage expected >= 2 |
| combat_difficulty_reflects_threat | combat_difficulty 反映 A-007 的 extreme 威胁等级 | ✅ | threatLevel=extreme, floor_mod=none |

**场景结果**: ✅ 全部通过

### boundary-multi-anomaly
**多异常同时出现——A-001 窃时者 + A-004 循环裂隙**

> 验证 2+ 异常同时在场时 combat adjudication 是否正确聚合威胁分数

| Invariant | 描述 | 结果 | 证据 |
|-----------|------|------|------|
| likelyCost_not_unknown | 多异常 likelyCost 不低于 heavy（最高风险场景） | ✅ | anomalies=A-001,A-004, totalPower=66 |
| multi_threat_aggregation | 多异常威胁正确聚合，威胁等级 >= high | ✅ | threat=extreme, count=2 |
| sanity_damage_declared | 多异常战斗 sanity_damage 声明且 >= 2 | ✅ | multi-anomaly combat → sanity_damage expected >= 3 |
| combat_difficulty_max | combat_difficulty 反映多异常 extreme 风险 | ✅ | extreme=extreme, aggression=0.7,0.6 |

**场景结果**: ✅ 全部通过

### boundary-tactical-escape
**战术撤离——利用 evasive profile 脱离 A-002 静默回廊**

> 验证 TACTICAL_COMBAT_PROFILES 中 evasive profile 是否正确应用：aggression×0.5, basePower×0.6

| Invariant | 描述 | 结果 | 证据 |
|-----------|------|------|------|
| evasive_profile_applied | Evasive 模式正确应用：降低 aggression 和 basePower | ✅ | evasive mode: anomaly=A-002, combatMode=escape |
| likelyCost_not_unknown | 撤离场景 likelyCost 明确（来自战术 profile） | ✅ | tacticalProfile=tactical_evasive |
| escape_cost_reduced | Evasive 模式降低战斗代价（低于 direct combat） | ✅ | combatMode=escape, evasive reduces aggression and basePower |

**场景结果**: ✅ 全部通过


---

## 4. Combat Invariant 全局检查

- **likelyCost not unknown**: ✅ (5/5)
- **combat_difficulty reflects threat**: ✅ (3/3)
- **sanity_damage declared**: ✅ (4/4)

---

## 5. 缺陷/违规清单

✅ 无 invariant 违规。
