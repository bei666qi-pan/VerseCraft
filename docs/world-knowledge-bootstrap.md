# 世界知识 Bootstrap（registry -> PostgreSQL）

本文档说明如何把 `src/lib/registry/*` 的静态世界观导入 `world_*` 数据表，作为“PostgreSQL 主事实源 + registry seed/fallback”的第一步。

## 目标与边界

- 只做数据层落地：建表、索引、幂等 seed。
- 不改 `/api/chat` JSON 契约与 SSE 流协议。
- 不改 `src/store/useGameStore.ts` 现有行为。
- 允许重复执行（幂等 upsert）。

## 涉及表

- `world_entities`
- `world_entity_tags`
- `world_entity_edges`
- `world_knowledge_chunks`
- `world_player_facts`
- `world_retrieval_cache_snapshots`

## 导入来源

Bootstrap 会读取这些 registry：

- `world.ts`（楼层、房间节点、NPC 社交图）
- `npcs.ts`
- `anomalies.ts`
- `items.ts`
- `warehouseItems.ts`
- `rules.ts`
- `apartmentTruth.ts`

## 执行顺序（生产建议）

1. 确保数据库可连接，应用环境变量正确（尤其 `DATABASE_URL`）。
2. 执行运行时建表兜底（脚本内会自动调用 `ensureRuntimeSchema()`）。
3. 执行 seed：
   - 正式导入：`pnpm seed:world-knowledge`
   - 预演（不提交事务）：`pnpm seed:world-knowledge -- --dry-run`
4. 验证记录量与索引命中，再逐步接入后续 RAG 检索注入逻辑。

## 幂等策略

- `world_entities`：`UNIQUE(entity_type, code)`，seed 使用 upsert。
- `world_entity_tags`：`UNIQUE(entity_id, tag)`，重复导入不会新增重复 tag。
- `world_entity_edges`：`UNIQUE(from_entity_id, to_entity_id, relation_type, relation_label)`。
- `world_knowledge_chunks`：`UNIQUE(entity_id, chunk_index)`，重复导入会覆盖更新内容。

## 向量/FTS 写入策略

- `content_tsv`：seed 中使用 `to_tsvector('simple', content)` 生成。
- `embedding_vector`：
  - 若数据库有 `pgvector`：写入 `vector(256)`。
  - 若无 `pgvector`：降级写入文本字面量，流程不中断。
- `embedding_status`：bootstrap 阶段直接写为 `ready`。
- `source_type`：统一写 `bootstrap`。

## 回滚与失败处理

- seed 在单事务中执行。
- 任一步骤报错将 `ROLLBACK`，不会产生半写入脏数据。
- `--dry-run` 模式始终回滚，可用于预检映射和 SQL 正确性。

## 常见运维建议（4C8G）

- 首次导入建议在低峰期执行。
- 初期可先使用 `--dry-run` 验证，再执行正式导入。
- 若后续 registry 变更，重复执行同一 seed 即可同步核心数据，不必手工清表。
