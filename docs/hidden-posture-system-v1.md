# VerseCraft 隐藏态势系统（V1）

本设计把既有战斗/冲突逻辑产品化为“隐藏态势系统”，而非传统数值 RPG。

## 设计目标

- 玩家感知：能不能压、该不该压、风险多大
- 玩家不可见：精确战力、公式细节、裸 score
- 仅在冲突回合/威胁回合显性化，不打断普通叙事回合

## 双层结构

## 1) 静态底色（长期能力）

来源：`playerCombatScore` 与 `npcCombatScore` 的 base/equipment/psyche 轴  
含义：角色长期“能不能把动作做完”的底层稳定性

## 2) 动态态势（当回合局势）

来源：scene/threat/位置/先手/人数/窗口等临场因子  
含义：当前这一步是否有压制窗口，代价是否可承受

## 玩家可感知四信号

1. 威胁感（Threat Sense）
2. 机会窗（Opportunity Window）
3. 代价预警（Cost Warning）
4. 结果层级（Result Layer）

## 态势等级

- `dominant`
- `upper_hand`
- `contested`
- `under_pressure`
- `collapse_risk`

映射来源：`computeCombatPrecheck().verdict` + 场景修正。

## 结果层级规则（非赢/输二元）

- 压制成功（`suppress_success`）
- 勉强逼退（`narrow_pushback`）
- 两败俱伤（`mutual_bruise`）
- 被迫撤离（`forced_withdraw`）
- 失控崩盘（`runaway_collapse`）

映射来源：`resolveCombat().outcome`，但对玩家只输出层级文本。

## 与主系统联动点（结构化）

冲突后果至少命中一个结构字段：

- `relationship_updates`：关系受损/威慑/债务变化
- `player_location`：位移、逼退、撤离
- `main_threat_updates`：威胁升温/压制/失控
- `weapon_updates`：武器稳定度、污染、损耗
- `task_updates`：委托推进/失败/转阶段

## 文风约束

- 不输出裸数值（战力、分数、公式）
- 不写系统面板术语轰炸
- 用叙事语言表达“窗口、位置、代价、后果”

## 代码落点

- 类型扩展：`src/lib/combat/types.ts`
- 映射与文案层：`src/lib/combat/combatPresentation.ts`
- 冲突锚点输出：`src/lib/combat/combatPromptBlock.ts`
- 结果裁决：`src/lib/combat/resolveCombat.ts`
- 静态/动态层摘要：`src/lib/combat/combatAdjudication.ts`

