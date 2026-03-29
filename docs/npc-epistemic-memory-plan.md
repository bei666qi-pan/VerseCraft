# NPC 认知与会话记忆分层方案（阶段 2）

## 为什么旧方案容易「串台」

原先压缩产物把 **`plot_summary`、`player_status`、`npc_relationships`** 作为一整块「动态记忆」注入 DM system prompt，且标题与结构容易让模型把这段理解成 **所有在场角色共享的世界观背景**。  
当 `plot_summary` 里写的是 **编排用全知摘要**（含未公开伏笔、系统真相）时，模型在生成 NPC 对白时极易 **直接引用** 这些内容，效果等同于 NPC **读了全剧本**。

## 新结构如何降低出戏

1. **分层字段**：在保留三键兼容的前提下，增加 `public_plot_summary`、`scene_public_state`、`player_known_summary`、`dm_only_truth_summary`、`npc_epistemic_snapshots` 等；压缩提示词要求 **系统真相、玩家独知、公共可见、传闻未证实** 分开填写。
2. **存储**：分层元数据嵌在 `player_status` 的 **`__vc_epistemic_v1`** 中，**不新增数据库列**；对外旧接口仍读写三列，由 `sessionMemoryToDbRow` / `hydrateEpistemicFromSessionRow` 做合并与剥离。
3. **Prompt 组装**：`buildMemoryBlock` 用 **显式标签** 标明各段归属（公共 / 玩家独知 / DM-only / NPC 快照），并 **不把嵌入 JSON 整坨** 打进「玩家状态」展示段。
4. **sanitize**：`world:`、`system:`、`canon:`、`dm:` 等前缀的 fact id **不得**进入 NPC 快照；非欣蓝 NPC 不得持有 `recognized_loop` 及含 `player_secret` 的 id；压缩失败时 **fallback 只收紧、不扩张** NPC 已知集合。

## 为什么在 4C8G / 当前架构下仍可运行

- **无新服务、无新表**：仅多一段 JSON 嵌入与 prompt 分段文案；压缩仍按原有阈值异步触发，不阻塞首字。
- **体量可控**：`npc_epistemic_snapshots` 有数量与字段长度上限；快车道可对各层单独缩字符上限。
- **渐进兼容**：旧行无嵌入时 `coerceToEpistemicMemory` 仍回落为「仅三键」；`getSessionMemory` 对外仍返回 **剥嵌入后的 `CompressedMemory`**。

## 相关代码入口

| 环节 | 文件 |
|------|------|
| 压缩与 DB 行转换 | `src/lib/memoryCompress.ts` |
| DM 动态记忆段 | `src/lib/playRealtime/playerChatSystemPrompt.ts`（`buildMemoryBlock`） |
| 异步写库 | `src/app/api/chat/route.ts` |
| Server Action 读写 | `src/app/actions/memory.ts` |
| 快照视图（供后续按 NPC 拼 prompt） | `src/lib/epistemic/sessionAdapters.ts`（`buildEpistemicMemorySnapshot`） |
