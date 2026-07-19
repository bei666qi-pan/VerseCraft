## Why

真实模型评审发现，未在 scene authority、codex 或结构化 delta 中出现的“格子衫男人”可以被叙事写成具象、可互动角色。现有实体审计会拦截编造姓名和裸 ID，但为保护氛围而放过带“男人/女人”后缀的描述性人物，形成可玩性与世界事实的缺口。

## What Changes

- 识别同时具有入场动作与个体化外观描述的未登记泛称人物，将其视为 NPC 实体主张，而不是普通氛围。
- 在 entity hard gate 命中但无模型修复可用时，替换最终叙事为保守的未知动静/无法确认身份文本；不保留原始可互动人物。
- 保留无行动、无个体化描述的人影、住户声响和远景氛围，避免将悬疑文本机械化。
- 将“穿旧工装的男人靠墙开口”这类真实模型样式纳入衣着描述识别，避免仅匹配“穿着”而遗漏动词省略表达。

## Capabilities

### New Capabilities

- `unregistered-described-npc-gate`: 对无结构化存在证据的具象陌生 NPC 引入实施审计与安全回退。

### Modified Capabilities

- 无。

## Impact

- 影响 `/api/chat` final validator/commit，SSE、DM JSON、schema、analytics 事件和数据库均不变。
- 仅运行在生成后 final hook，纯文本检测与本地 fallback，不增加模型、数据库或首字前 IO；复用既有 safety kernel 的 hard/shadow 开关。
- 非目标：不禁止氛围性人影、重写所有 NPC 描写或创建动态 NPC 生成系统。
