## Context

`applyRegisteredMechanicsGuard` 是 `/api/chat` 最终收口前的确定性状态守卫。它目前仅检查是否存在 `activeThreatIds`，随后直接选择第一个 ID 结算武器损耗和威胁压制；这使客户端输入可以给虚构 ID 赋予正式机制后果。3F 正式战斗注册表明确存在 `A-003`，旧评测 fixture 却使用了不存在的 `A-3F-SHADOW`。

## Goals / Non-Goals

**Goals:**

- 只让 `getAnomalyCombatStat` 可解析的目标进入确定性战斗和侦察叙事。
- 在未知或全未知目标时拒绝战斗结算，保留 SSE final 与零状态变更语义。
- 让 live mechanics campaign 使用已注册的 3F 目标，形成有效真实证据。

**Non-Goals:**

- 不改异常注册表、战斗数值、主模型 prompt、SSE 格式或客户端状态模型。
- 不根据 narrative 猜测目标，也不增加网络、数据库或模型调用。

## Decisions

### 1. 以战斗注册表作为唯一目标授权源

守卫将从客户端快照提取候选 ID 后同步调用 `getAnomalyCombatStat`，保留第一个有效 ID。它复用既有世界事实源，而不是维护一个容易漂移的局部 allowlist。

备选的“信任 activeThreatIds”被拒绝，因为这正是本次缺口；“让模型判断 ID”被拒绝，因为目标授权必须是确定性状态规则。

### 2. 未授权目标走无结算安全降级

显式战斗且没有有效目标时，删除武器/威胁/冲突 candidate delta，输出明确但不补造世界事实的叙事，设置 `consumes_time: false` 和审计 flag。该路径复用现有“没有活动威胁”语义，不改变 response envelope。

### 3. 已结算战斗不得叙事性否认目标

当注册目标通过守卫进入确定性结算时，候选叙事若宣称场景空荡、没有敌人/异常、或玩家朝空气攻击，则以已有的“异常阴影压近、有效压制、武器损耗”确定性文本收口。该检测只处理与权威战斗 delta 直接矛盾的否认语，不约束一般的不可见、压迫或悬疑描写。

### 3.1 已登记 ID 搭配攻击动词是明确意图

若结构化快照已含注册目标，玩家以 `A-003` 等 ID 加明确攻击动词发起行动，与中文“异常/威胁”目标同样可结算。ID 单独出现或没有攻击动词仍不构成战斗意图；未知 ID 仍无法绕过注册表。这样避免把模型或玩家选择的机器可读目标误判为“尚不足以形成战果”。

### 3.2 提交安全收口后重申已登记机械裁决

安全收口可以清空不受支持的候选状态，但不得随机撤销结构化登记目标上的明确攻击或登记物品上的明确交付。commit 后再运行同一纯 guard；它只重申注册表 / 行囊前提已满足的裁决，并把“尚不足以形成战果”类安全 fallback 改为已结算文本，不放宽任何未知目标或缺件交付。

### 4. 评测 fixture 与正史注册表对齐

3F combat scenario、counterfactual branch 和 focused real campaign 全部使用 `A-003`。这既验证合法链路，也让模型评审的 permitted facts 和主动威胁 ID 一致。

## Risks / Trade-offs

- [旧存档包含历史自定义 threat ID] → 它不再能触发确定性战斗结算；玩家收到无结算回合而非获得伪造状态后果。
- [多目标快照包含未知 ID 在有效 ID 前] → 守卫过滤未知值并选择第一个已注册目标，避免顺序导致错误拒绝。
- [fixture 更新掩盖产品缺陷] → 新增未知 ID 的拒绝单测，并用真实 SUT 重跑 campaign 与模型复审。

## Migration Plan

1. 加入注册表过滤与未知目标拒绝测试。
2. 将评测 fixture 和 campaign 改为 `A-003`。
3. 执行 focused tests、真实 live campaign 与 strict live review；失败时回滚本 change 即可，既有 SSE/数据无需迁移。
