# KG 可观测性

## 关键事件

- Cache：`kg_cache_hit`、`kg_cache_miss`、`kg_cache_write`
- Worker：`kg_job_claimed`、`kg_job_succeeded`、`kg_job_failed`
- 共识晋升可先通过 `kg_job_succeeded` 且 `payload.jobType=CONSENSUS_ONE` 观察

## 常用 SQL

### 近 7 天 cache hit rate

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

### CONSENSUS 成功趋势

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

### Worker 失败率（24h）

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

## 回滚步骤

1. 设置 `VC_KG_ENABLED=0`。
2. 重启 Web 与 Worker 进程。
3. 验证 `/api/chat` 仍满足 SSE/DM 契约，且 KG 事件下降。

