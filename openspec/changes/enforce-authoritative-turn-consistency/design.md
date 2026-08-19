## Context

当前未提交实现中，`resolveDmTurn` 会用 narrative 正则补出冲突结果和理智伤害，地点一致性 guard 会从正文推断 `player_location`。这两条路径使 Writer 文本越过 normalization/guards/rules 成为状态源。现有 authored movement guard 已能使用玩家输入与注册世界图，适合作为唯一移动补全入口；实体和物品 validator 已存在，可增量扩展而不建立平行链路。

## Goals / Non-Goals

**Goals:**
- 让所有权威状态只来自结构化候选、当前状态、注册事实和确定性规则。
- 让玩家输入中的地点/物品意图在高置信度且无歧义时被安全解析。
- 让最终 narrative 与已裁决结果一致，同时守住 20 秒 final p95 预算和 SSE 契约。

**Non-Goals:**
- 不通过 prompt 声明替代确定性 guard。
- 不修改 DB、auth、主 store/snapshot schema 或 analytics event shape。
- 不重构 Director、gateway provider 或客户端 UI。

## Decisions

### D1: Narrative 只可被校验，不可被解析为状态

删除 narrative-to-state fallback。生成后逻辑可识别正文与结构化事实的冲突并重写正文，但不得因此新增/修改地点、伤害、理智、死亡、冲突、NPC 或物品 delta。与“尽量挽救模型正文”相比，这能保证可审计性和重放确定性。

### D2: 移动补全只解析玩家行动和图邻接

别名解析从当前节点的邻接集合构造候选：精确 id/label、楼层+房号、裸房号等归一化后必须唯一匹配。每回合最多产生一条相邻边；未知、跨图、非邻接或多匹配不移动。正文只用于发现矛盾并触发 narrative repair/fallback。

### D3: 机制变化要求 causality proof

冲突、伤害、理智和死亡字段进入 commit 前必须携带结构化候选且通过规则校验，或由已注册目标/威胁机制确定性产生。仅 narrative 命中关键词不构成 proof。未经证明的字段被剥离并记录 audit flag。

### D4: 实体与物品按世界作用域校验

调用方传入当前世界/场景/会话允许的 canonical NPC ids 和 authoritative inventory/registered items。所有结构化 NPC 写入键都统一过滤；明确“使用/挥动/点燃/装备 X”的高置信度 action item 若不在允许集合中，返回合法失败或安全拒绝，提交零物品/战斗 delta。场景中的普通名词不进行所有权推断。

### D5: 有界 Writer-only 修复

结构化合法变化缺少玩家可见后果，或正文否认已裁决事实时，只允许一次 narrative-only repair；输入为过滤后的已裁决事实，输出只能替换 narrative/options 文本。预算取共享 final deadline 的剩余值并受 repair 上限约束；失败使用确定性、可审计、安全 fallback。

### D6: 单一性能预算事实源

运行时 hook 与 eval frame timeout 从 `CHAT_LATENCY_BUDGET` 派生。可选工作在剩余预算不足时跳过；status 和首段正文路径不等待 repair、DB、analytics 或 world tick。

## Risks / Trade-offs

- [Risk] 旧模型输出依赖正文补状态后会提交更少变化 → 通过 prompt/schema 和结构化规则修复模型候选，不恢复文本推断。
- [Risk] 房号别名在多楼层产生歧义 → 只在当前邻接集合唯一命中时移动，否则返回澄清/拒绝。
- [Risk] 物品抽取误伤环境描写 → 仅分析玩家 action，限定明确使用动词和短名词槽，并用 negative tests 保护普通探索。
- [Risk] narrative repair 增加 final 延迟 → 仅生成后执行一次、共享 deadline、预算不足跳过并采用 fallback。

## Migration Plan

无需数据迁移。以 guards/tests 直接替换不符合目标契约的未提交 fallback；保留 SSE、DM JSON 和存档兼容。回滚时可关闭新增的强化校验开关，但不得恢复 narrative-to-state 推断。

## Open Questions

无；本次行为和兼容边界已由计划锁定。
