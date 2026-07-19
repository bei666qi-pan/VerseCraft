## Why

战斗确定性守卫曾把客户端快照中的任意 `activeThreatId` 当作已登记目标，因此一个不存在于异常战斗注册表的 ID 也能造成武器损耗和威胁状态变化。真实模型复审已捕获该缺口；它会让叙事把外部输入误写成世界事实。

## What Changes

- 仅允许异常战斗注册表中存在的 threat ID 进入确定性战斗结算和威胁侦察叙事。
- 没有有效登记目标时返回不发生战斗、无武器损耗的可解析回合，并标记审计原因。
- 将 3F 的真实 playthrough fixtures 改为已注册的 `A-003`，防止评测输入自身伪造世界事实。
- 当已注册目标产生战斗结算时，拒绝“场景空荡、没有敌人、朝空气攻击”等与该结算冲突的候选叙事，并使用既有确定性战斗叙事收口。
- 为合法目标、未知目标与混合列表补充单元与真实 SUT 回归验证。

## Capabilities

### New Capabilities

- `registered-combat-target-gate`: 确定性战斗只接受已注册、可审计的异常目标。

### Modified Capabilities

- None.

## Impact

- 影响 `registeredMechanicsGuard`、确定性威胁侦察、live mechanics campaign 与其 tests。
- 不修改 `/api/chat` 的 SSE/DM JSON 契约、数据库 schema、analytics 事件或客户端 store；拒绝路径仍经既有 final 收口返回。
- 不增加首字前模型调用、TTFT 或网络 IO；注册表 lookup 为同步纯函数。无有效目标时安全降级为无状态变更回合。
- 不涉及 prompt、reasoner、world tick 或架构重写；该规则随现有确定性守卫始终生效，无额外灰度开关。
