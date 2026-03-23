# World Knowledge RAG 运维手册

## 1. 数据流总览

1. `/api/chat` 在组装 system prompt 前调用 `getRuntimeLore(...)` 检索世界知识。  
2. 检索优先读取 world cache（请求内 memo -> Redis -> 内存 fallback），未命中再查 PostgreSQL。  
3. 若 DB 异常或无结果，走 registry fallback 生成最小 lore packet。  
4. 回合终帧 `__VERSECRAFT_FINAL__` 发出后，异步触发 `persistTurnFacts(...)` 写回私有/会话事实与共享候选。  
5. 共享候选经 `vc_world_candidate -> janitor -> consensus` 流程审核，避免模型叙述直接污染共享事实。  

## 2. 上线步骤

1. 执行 schema/migration（确保 `world_*` 与 KG 相关表齐全）。  
2. 执行 world seed：`pnpm seed:world-knowledge`。  
3. 启动服务后验证：  
   - `/api/admin/world-knowledge/entities`  
   - `/api/admin/world-knowledge/candidates`  
   - `/api/admin/world-knowledge/retrieval-stats`  
4. 运行关键测试与基准：  
   - `pnpm test:unit`  
   - `pnpm benchmark:world-retrieval`  
5. 观察 24h 指标后再扩大流量。  

## 3. seed 步骤

1. 确认数据库可连通（`DATABASE_URL`）。  
2. 运行 `pnpm seed:world-knowledge`。  
3. 可重复执行（幂等），用于修复漏种子。  
4. 种子仅用于 bootstrap，运行时事实以 DB 检索为准。  

## 4. 缓存失效策略

- cache key 已包含版本、scope、user、session、fingerprint 与 world revision。  
- 写回私有/会话事实后，下一回合通过短 TTL + 新指纹自然收敛。  
- 高风险/冲突事实短 TTL。  
- Redis 不可用时退化到内存 fallback（带短 stale grace）。  

## 5. 故障排查

1. 先看 `/api/admin/world-knowledge/retrieval-stats` 的 fallback 与命中率。  
2. 再看 `/api/admin/ai-routing` 里的 observability 记录：  
   - `retrievalLatencyMs`  
   - `retrievalCacheHit`  
   - `lorePacketChars`  
   - `fallbackRegistryUsed`  
3. 若写回异常，检查 chat 日志 `world writeback skipped` 与 DB 权限。  

## 6. Redis 不可用时降级

- 检索链路自动降级：Redis miss -> PostgreSQL -> 内存 fallback。  
- 风险：命中率下降、TTFT 抖动。  
- 处理：先恢复 Redis，再观察 15-30 分钟命中率是否回升。  

## 7. PostgreSQL 慢查询排查

1. 优先检查 `world_knowledge_chunks` 上 FTS/owner/scope 相关索引。  
2. 关注单次 DB round trips 是否触顶（守卫常量限制）。  
3. 若慢查询持续，先调小每次召回上限，再做索引优化。  

## 8. 如何审核 shared candidate

1. 拉取候选：`GET /api/admin/world-knowledge/candidates`。  
2. 审核动作：`POST /api/admin/world-knowledge/candidates/:id/review`，body 示例：  
   - `{\"source\":\"world_player_facts\",\"decision\":\"allow_shared\"}`  
   - `{\"source\":\"world_player_facts\",\"decision\":\"reject\"}`  
   - `{\"source\":\"vc_world_candidate\",\"decision\":\"allow_shared\"}`  
3. 原则：冲突或推测性叙述默认拒绝或仅私有化。  

## 9. 清理历史私有/session facts

建议离峰执行：

```sql
-- 清理 30 天前 session facts
DELETE FROM world_player_facts
WHERE fact_type = 'session'
  AND updated_at < NOW() - INTERVAL '30 days';

-- 清理低置信冲突事实（示例）
DELETE FROM world_player_facts
WHERE conflict_status IS NOT NULL
  AND approved_to_shared = false
  AND updated_at < NOW() - INTERVAL '14 days';
```

清理后可按需执行一次检索基准，确认性能恢复。
