## ADDED Requirements

### Requirement: 星逆生产 packet 只暴露当前合法切片
星逆动态 packet SHALL 只包含当前地点、时段、在场 NPC、允许 reveal 事实、当前目标、合法服务、登记行动及受限玩家摘要，不得发送 sealed 事实或完整未解锁任务图。

#### Scenario: 组装普通星逆回合
- **WHEN** 玩家在青石县提交行动
- **THEN** packet 包含当前任务和可见 NPC 且不包含其他时段 NPC 的私密事实

### Requirement: 星逆正文服从裁决结果
星逆 prompt MUST 要求原创中文商业玄幻连载感、第三人称贴身视角、直接冲突与合法章末钩子，并禁止正文授予奖励、跳过前置、改变境界或宣布未裁决胜利。

#### Scenario: 非法行动被拒绝
- **WHEN** 权威裁决拒绝玩家行动
- **THEN** 正文以世界内原因表现受阻并只建议当前合法方向

