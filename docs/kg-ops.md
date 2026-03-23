# KG 运维与部署（4C8G）

本项目推荐将 Web 与 KG Worker 分为两个进程部署，避免单进程阻塞和连接争用。

## 进程建议

- Web：保持 `MIGRATE_ON_BOOT=1`，启动时执行 `scripts/migrate.js`。
- Worker：单独服务运行 `pnpm worker:kg`；排障时可用 `pnpm worker:kg:once`。
- Weekly compaction：通过 Coolify Scheduler 或 cron 每周执行 `pnpm kg:compact`。

## 连接与并发边界

- 应用连接池在 `src/db/index.ts` 固定 `max=10`。
- 4C8G 环境建议先单实例 Worker，`VC_WORKER_CONCURRENCY=1`（最多 `2`）。
- 避免无上限横向扩容 Worker，否则总连接数会快速逼近 `max_connections`。

## 推荐部署步骤

1. Web 容器上线并确认 `MIGRATE_ON_BOOT=1`。
2. 新增 Worker 服务，启动命令 `pnpm worker:kg`。
3. 配置每周任务 `pnpm kg:compact`。
4. 可选执行 `pnpm kg:self-check` 和 `VC_CHECK_KG_SCHEMA=1 pnpm db:check`。

## 快速回滚

- 设置 `VC_KG_ENABLED=0`。
- 重启 Web 与 Worker。
- Worker 会打印 `worker_skip_kg_disabled` 并退出 0，避免重启风暴。

