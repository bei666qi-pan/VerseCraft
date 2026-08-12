# KG 运维与可观测性

## 部署与进程

本项目推荐将 Web 与 KG Worker 分为两个进程部署，避免单进程阻塞和连接争用。

### 进程建议

- Web：保持 `MIGRATE_ON_BOOT=1`，生产 Dockerfile 默认通过 `scripts/start-production.mjs` 同时启动 Web 与单并发嵌入式 Worker。
- Worker：若拆成独立服务，运行 `node --conditions=react-server --import tsx scripts/vc-worker.ts`；排障时可用 `pnpm worker:kg:once`。
- Weekly compaction：通过 Coolify Scheduler 或 cron 每周执行 `pnpm kg:compact`。

### 连接与并发边界

- 应用连接池在 `src/db/index.ts` 固定 `max=10`。
- 4C8G 环境建议先单实例 Worker，`VC_WORKER_CONCURRENCY=1`（最多 `2`）。
- 避免无上限横向扩容 Worker，否则总连接数会快速逼近 `max_connections`。

### 推荐部署步骤

1. Web 容器上线并确认 `MIGRATE_ON_BOOT=1`。
2. 默认 Web 容器已启动嵌入式 Worker；如需关闭，设置 `VC_RUN_EMBEDDED_WORKER=0` 并重启。
3. 如改为独立 Worker 服务，可通过 `docker-compose --profile production up -d` 自动拉起 vc-worker 服务。
4. 配置每周任务 `pnpm kg:compact`。
5. 可选执行 `pnpm kg:self-check` 和 `VC_CHECK_KG_SCHEMA=1 pnpm db:check`。

### 快速回滚

- 设置 `VC_KG_ENABLED=0`。
- 重启 Web 与 Worker。
- Worker 会打印 `worker_skip_kg_disabled` 并退出 0，避免重启风暴。

---

## 可观测性

### 关键事件

- Cache：`kg_cache_hit`、`kg_cache_miss`、`kg_cache_write`
- Worker：`kg_job_claimed`、`kg_job_succeeded`、`kg_job_failed`
- 共识晋升可先通过 `kg_job_succeeded` 且 `payload.jobType=CONSENSUS_ONE` 观察

### 常用 SQL

#### 近 7 天 cache hit rate

```sql
select
  date_trunc('day', event_time) as day,
  sum(case when event_name = 'kg_cache_hit' then 1 else 0 end)::float
    / nullif(sum(case when event_name in ('kg_cache_hit','kg_cache_miss') then 1 else 0 end), 0) as hit_rate
from analytics_events
where event_time >= now() - interval '7 days'
  and event_name in ('kg_cache_hit','kg_cache_miss')
group by 1
order by 1;
```

#### CONSENSUS 成功趋势

```sql
select
  date_trunc('day', event_time) as day,
  count(*) as consensus_success
from analytics_events
where event_time >= now() - interval '14 days'
  and event_name = 'kg_job_succeeded'
  and payload->>'jobType' = 'CONSENSUS_ONE'
group by 1
order by 1;
```

#### Worker 失败率（24h）

```sql
with t as (
  select
    sum(case when event_name = 'kg_job_failed' then 1 else 0 end) as failed,
    sum(case when event_name in ('kg_job_succeeded','kg_job_failed') then 1 else 0 end) as total
  from analytics_events
  where event_time >= now() - interval '24 hours'
    and event_name in ('kg_job_succeeded','kg_job_failed')
)
select failed, total, failed::float / nullif(total, 0) as fail_rate
from t;
```

### 回滚步骤

1. 设置 `VC_KG_ENABLED=0`。
2. 重启 Web 与 Worker 进程。
3. 验证 `/api/chat` 仍满足 SSE/DM 契约，且 KG 事件下降。
