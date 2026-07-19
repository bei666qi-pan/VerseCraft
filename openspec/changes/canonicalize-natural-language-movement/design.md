## Context

`/api/chat` 将模型的 `player_location` 视为候选，随后由 `applyAuthoredLocationMovementGuard` 依据 `buildWorldGraph` 验证。真实 live playthrough 暴露两个断点：实际开局节点 `3F_Hallway` 没有边；模型输出可读中文地点（如“二楼楼梯转角”）而非内部 ID。现有 guard 对所有无效 candidate 都改写为非法移动，即使玩家本轮只是观察。

该行为位于模型生成后的 structural/final hook，因而修复必须保持为纯函数、只使用当前 action、client state、候选 DM 和静态世界图。

## Goals / Non-Goals

**Goals:**

- 让开局于 `3F_Hallway` 的玩家能以自然语言开始一条已登记的移动链。
- 对中文地点别名和楼层方向只合成一个图中相邻且可通行的 canonical `player_location`。
- 防止模型描述尚未提交的多层抵达，且不因无效 location delta 破坏非移动回合。
- 允许以单独 rollout flag 关闭该新合成路径。

**Non-Goals:**

- 不从 narrative 文本提取新地点或修改客户端状态。
- 不允许多跳传送、不新增动态路径规划、不开启模型调用或数据库查询。
- 不改动游戏地图以外的任务、职业、NPC、SSE 或 analytics 契约。

## Decisions

### 1. 将 `3F_Hallway` 连接到唯一的既有楼梯间

把 `3F_Hallway ↔ 3F_Stairwell` 加入静态图。它只补齐已存在房间节点之间的地理连通性；没有开放新楼层或绕过锁边。相比将全部 “Hallway” 节点盲目互连，此项最小且直接对应真实开局。

### 2. 只接受有限别名与一跳方向解析

guard 先把已知保存位置和少数玩家可见的中文地点别名 canonicalize；然后仅在 action 明确是移动、目标是图中相邻节点且边可通行时写入状态。对“上楼/下楼”，只选择当前节点的一个符合方向的相邻边；若玩家尚在走廊，允许先进入同层相邻楼梯间，而不是声称跨越多层。

相比用 LLM 或 narrative 正文猜地点，这个解析器的候选集完全来自静态世界图，因此能测试、能回滚且不把文本当作状态源。

### 3. 按玩家意图处理无效模型地点 delta

当玩家明确移动但没有可确认的一跳，剥离 candidate 并给出仍在原地的保守说明；当玩家不是移动，剥离无效 candidate、保留合法观察叙事和原有合法性。这样模型的地点幻觉不会篡改状态，也不会把“检查门缝”误伤为非法行动。

### 4. 新路径使用独立 rollout

`VERSECRAFT_ENABLE_CANONICAL_LOCATION_MOVEMENT` 默认开启；关闭时跳过中文别名与方向合成，仍保留既有 candidate 图校验。它运行在 final structural hook，不触碰 status/first token、无 IO、无 LLM 调用。

## Risks / Trade-offs

- [别名含义可能在后续世界中重名] → 别名表保持小且只映射当前公开地点；测试要求图邻接与通行权同时成立。
- [“下楼”从走廊只进入楼梯间，玩家预期到下一层] → 输出明确“先进入楼梯间”，并通过连续回合逐边推进，优先保证状态真实。
- [新 guard 改写有文学价值的移动 prose] → 仅在模型文本与无法提交的地点 delta 冲突时改写；开关可即时回滚。

## Migration Plan

1. 在开发环境默认启用，跑纯函数单测、route contract 与真实 `/api/chat` 多回合移动证据。
2. 观察 final 的 `canonical_location_transition_v1` / `invalid_location_delta_stripped_v1` flags；无数据迁移。
3. 如出现误判，设 `VERSECRAFT_ENABLE_CANONICAL_LOCATION_MOVEMENT=false` 回滚新合成路径，再依据 evidence 收窄别名。

## Open Questions

- 无。后续增加地点别名必须以真实 trace 和相邻图测试为前提。
