# PostgreSQL 调优建议（4C8G）

以下参数用于 VerseCraft 的起步配置，需结合实际负载迭代。官方参考见 [PostgreSQL Runtime Resource](https://www.postgresql.org/docs/current/runtime-config-resource.html)。

## 内存相关

- `shared_buffers`：建议从约 25% RAM 起步（4C8G 可先试 `2GB`），通常不超过 40%。
- `work_mem`：按「每个操作」分配，不是每连接；建议小步起调（如 `8MB`）。
- `maintenance_work_mem`：可高于 `work_mem`（如 `256MB`），用于 VACUUM/索引维护。
- 注意总内存约等于：并发查询中的排序/哈希操作数 × `work_mem`，避免 OOM。

## 连接与 autovacuum

- 优先控制应用侧并发与连接数，再提高 `max_connections`。
- 4C8G 下推荐单 Worker + 低并发，必要时再引入 PgBouncer。
- 维护任务和 autovacuum 也会占用内存，调参时要预留余量。

## pgvector（IVFFlat）

本项目统一使用 IVFFlat（不使用 HNSW），参考 [pgvector 索引说明](https://github.com/pgvector/pgvector)。

- `lists` 经验值：`rows / 1000` 或 `sqrt(rows)`。
- 查询 `probes` 经验值：约 `sqrt(lists)`。
- 请求内按需设置：`SET LOCAL ivfflat.probes = ...`。
- 建议在有足够数据后再创建 IVFFlat，聚类质量通常更好。

