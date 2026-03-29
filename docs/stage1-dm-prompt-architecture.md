# Stage 1 DM Prompt 架构说明

## 设计目标

- 缩短 stable prompt
- 减少可变 lore 硬编码
- 保持 JSON 契约稳定
- 降低 token 成本并尽量改善 TTFT

## 三层结构

1. **Stable Prompt（短）**  
   只保留：合规红线、JSON 契约、叙事红线、少量不可变规则。

2. **Runtime Packets（结构化）**  
   每回合注入：
   - location / task / service / anchor / revive / relationship / worldFlags 等 packet
   - 支持 `maxChars` 预算与 compact 降级

3. **Retrieval（轻量可控）**  
   复用 runtime lore retrieval，按 location/entity/worldFlags 定向召回，不强依赖新增向量 infra。

## 观测项

- `stableCharLen`
- `dynamicCharLen`
- `lorePacketChars`
- `runtimePacketChars`
- `runtimePacketTokenEstimate`
- `firstChunkLatencyMs`（TTFT）
- **阶段 4·认知权限化动态记忆**（`chat_request_started` payload）：`epistemicFactCount`、`actorKnownFactCount`、`publicFactCount`、`anomalySeverity`、`validatorTriggered`、`promptCharsDelta`、`actorScopedMemoryBlockChars`；动态段使用 `actor_epistemic_scoped_packet`（按焦点 NPC 裁剪，不全量注入 plot_summary / dm 真相 / 玩家独知 / 全量关系表）。

