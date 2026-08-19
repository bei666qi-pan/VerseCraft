# world-scoped-narrative-style Specification

## Purpose

规定不同世界如何选择独立的 stable prompt、缓存键、叙事视角和样例，并通过知识权限与双向污染校验确保暗月和星逆·太初的正文及事实互不渗透。

## Requirements

### Requirement: 按世界选择叙事契约
系统 MUST 为暗月和星逆·太初选择不同的 stable prompt、缓存键、样例与 POV validator。

#### Scenario: 生成星逆正文
- **WHEN** 星逆·太初回合进入模型生成
- **THEN** prompt 要求第三人称贴身主角视角、商业玄幻连载节奏与原创表达

#### Scenario: 生成暗月正文
- **WHEN** 暗月回合进入模型生成
- **THEN** 系统继续使用既有第一人称悬疑契约且不注入玄幻设定

### Requirement: 双向阻止上下文污染
星逆 prompt/narrative MUST 不包含暗月专属事实，暗月 prompt/narrative MUST 不包含星逆专属事实；共享结构化协议词不视为污染。

#### Scenario: 星逆候选出现暗月实体
- **WHEN** 星逆 candidate narrative 出现 B1、公寓 NPC、原石或异常世界事实
- **THEN** validator 标记冲突并以不含该事实的安全结果收口

### Requirement: 玄幻正文保持有限第三人称知识边界
星逆正文 SHALL 使用贴近玩家角色的第三人称，不得切入 NPC 未公开内心或陈述超出 reveal 权限的确定事实。

#### Scenario: NPC 内心越权
- **WHEN** candidate narrative 直接断言 NPC 隐秘动机但没有允许的 factId
- **THEN** narrative validator 阻断或降级该断言

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
