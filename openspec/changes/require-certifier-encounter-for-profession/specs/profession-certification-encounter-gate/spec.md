## ADDED Requirements

### Requirement: Certification requires structured certifier encounter

系统 MUST 仅在玩家本回合位于一楼且已完成回合的结构化 NPC 更新中包含注册职业签发者时，首次记录签发者相遇并允许既有职业资格逻辑展示认证选择。运行时 NPC 位置、叙事文本或模型声明均不得单独作为首次相遇证据。

#### Scenario: 签发者结构化出现

- **WHEN** 一楼回合的 `codex_updates`、`relationship_updates` 或 `npc_location_updates` 包含已注册签发者 id
- **THEN** 系统 MUST 记录已遇到签发者，并在其他资格均满足时允许认证选择

#### Scenario: 同楼但未相遇

- **WHEN** 签发者仅在运行时 NPC 位置中位于一楼，且本回合没有结构化签发者更新
- **THEN** 系统 MUST 不记录首次相遇，也不得仅因此展示认证选择

### Requirement: Confirmed encounter remains compatible with later certification

一旦相遇已由结构化证据确认，系统 SHALL 将 `hasMetProfessionCertifier` 写入 client-first 持久化状态；后续认证仍 MUST 通过既有资格与单职业检查。旧存档缺少该字段时 MUST 视为未确认相遇，且不得臆造认证资格。

认证的 store action / reducer MUST 独立要求该已确认相遇证明；不得只因页面曾展示职业选项或资格计算为真就写入职业。

#### Scenario: 玩家稍后回到一楼认证

- **WHEN** 已确认相遇的无职业玩家在一楼满足试炼、属性和行为资格
- **THEN** 系统 MUST 允许既有认证选择和 store 认证 action 正常完成

#### Scenario: 重载后保留已确认相遇

- **WHEN** 已确认相遇的无职业玩家保存并重新加载同一局
- **THEN** 系统 MUST 保留 `hasMetProfessionCertifier`，并仍按既有资格与单职业规则允许认证

#### Scenario: 旧存档缺少相遇字段

- **WHEN** 旧 client-first 持久化状态不包含 `hasMetProfessionCertifier`
- **THEN** 系统 MUST 将其视为 `false`，且不得仅凭职业资格开放认证

#### Scenario: Direct certification call without encounter proof

- **WHEN** 调用者绕过或复用陈旧认证 UI，职业资格为真但 `hasMetProfessionCertifier` 为假
- **THEN** store action 和 reducer MUST 拒绝认证且不改变当前职业
