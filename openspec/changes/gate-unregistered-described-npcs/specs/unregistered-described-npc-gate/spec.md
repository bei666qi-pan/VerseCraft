## ADDED Requirements

### Requirement: 具象的未注册人物必须被实体审计阻断

系统 SHALL 在候选叙事引入一个未被运行时授权的泛称人物时，若文本同时包含其入场或场景行动以及个体化外貌、衣着或身体状态，报告高严重度 `unknown_entity_surface` 实体问题。仅有背景声音、模糊人影或不含个体化描述的氛围表述 MUST NOT 单独触发该问题。

#### Scenario: 格子衫陌生人被阻断
- **WHEN** 候选叙事把未授权的“格子衫男人”写成从门缝探身、眼眶发红且头发凌乱的人物
- **THEN** 实体审计报告高严重度的 `unknown_entity_surface`

#### Scenario: 工装陌生人的动词省略描述被阻断
- **WHEN** 候选叙事写入一个“穿旧工装的男人”靠在墙边并开口说话，且场景没有授权 NPC
- **THEN** 实体审计报告高严重度的 `unknown_entity_surface`，hard mode 最终提交不得保留该人物

#### Scenario: 玩家诱导后改写的陌生人物仍被阻断
- **WHEN** 玩家提及门缝里的格子衫男人，且场景没有已授权 NPC，候选叙事把该未授权人物改写为后退、盯视或“他/那人”等指代主体并保留衣着或外貌细节
- **THEN** 玩家文本不得构成实体授权，实体审计仍报告高严重度的 `unknown_entity_surface`

#### Scenario: 模糊氛围人物不被误伤
- **WHEN** 候选叙事仅描述远处有人咳嗽或一道人影掠过
- **THEN** 实体审计不因该表述报告 `unknown_entity_surface`

### Requirement: 具象陌生人物 hard gate 必须提交安全的身份未确认叙事

当 hard-mode 实体审计存在“具象的未注册人物”阻断问题且没有有效的 narrative override 时，最终提交 SHALL 用保守、身份未确认的叙事替换候选文本，并移除候选状态变化和交互选项。该降级 MUST 保持 `/api/chat` 的既有 SSE 和 DM JSON 字段契约；shadow 模式 MUST 只记录审计结果而不替换文本。其他既有实体 hard gate 保持其原有、范围更窄的提交行为。

#### Scenario: hard gate 替换不安全人物叙事
- **WHEN** hard-mode 回合包含一个高严重度的未注册具象人物问题
- **THEN** 最终 narrative 不再包含该人物、选项和候选状态变化，并标记已应用安全叙事降级

#### Scenario: shadow 模式不改变候选结果
- **WHEN** 同类实体问题在 shadow 模式发生
- **THEN** 系统保留候选 narrative 与状态，同时产出审计证据
