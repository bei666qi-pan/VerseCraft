## ADDED Requirements

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
