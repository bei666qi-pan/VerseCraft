## Why

真实 `/api/chat` 长回合游玩显示，玩家从 `3F_Hallway` 输入“下楼探索”时，模型虽已产生合理的中文地点描述，服务端却因世界图遗漏该节点的出口、且只接受内部节点 ID，而将移动拒绝或让叙事与状态分离。结果既阻断了自然语言游玩，也允许“已到一楼”的小说内容在结构位置仍为三楼时提交。

## What Changes

- 补全 `3F_Hallway` 到已登记相邻节点的世界图连接，保持移动仍逐边校验。
- 在 final hook 将有限、可审计的中文地点别名和“上/下楼”意图解析为**一个**已登记、可通行的相邻节点；多层目标只提交当前可确认的一步。
- 当模型在非移动动作中附带无效地点 delta 时，只剥离该 delta，不把一次观察动作误判成非法移动；当移动无法确认时，使用保守的“仍在原地”叙事。
- 通过 `VERSECRAFT_ENABLE_CANONICAL_LOCATION_MOVEMENT` 灰度控制新解析/合成路径，保留 SSE、DM JSON 和 state-delta 优先级。

## Capabilities

### New Capabilities

- `canonical-natural-language-movement`: 将玩家自然语言移动意图映射为一个经世界图确认的 canonical 位置状态，并阻止未提交的跨层叙事。

### Modified Capabilities

- 无。

## Impact

- 影响 `src/lib/revive/graph.ts`、`src/lib/playRealtime/authoredLocationMovementGuard.ts` 与既有 `/api/chat` final structural guard 调用；不改变 SSE 终帧、数据库 schema、analytics 事件或模型路由。
- 全部逻辑为无 IO 纯函数，在生成后 final hook 执行，不增加首个 status/首字前延迟，也不调用 LLM。
- 开关关闭时保留既有模型 location delta 校验；无法映射或不可通行时绝不从 narrative 推断状态。
