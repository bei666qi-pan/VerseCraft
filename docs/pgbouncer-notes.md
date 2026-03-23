# PgBouncer 备注

官方文档见 [PgBouncer Config](https://www.pgbouncer.org/config.html)。

## 池化模式

- `session`：客户端会话绑定后端连接，兼容性最好。
- `transaction`：事务级复用连接，通常是 Web 场景的首选。
- `statement`：粒度最细，限制最多，通常不建议默认使用。

VerseCraft 以短事务为主，优先考虑 `transaction pooling`。

## 与当前 KG 查询的关系

- KG 语义缓存查询在事务内使用 `SET LOCAL ivfflat.probes`，在单事务单连接内生效。
- 该模式与 transaction pooling 兼容，不要求跨请求保持 session 状态。

## 注意事项

- 使用 transaction pooling 时，依赖长期 session 状态的特性会受限（例如跨事务 session 变量、会话级 prepared statements）。
- 引入 PgBouncer 后，仍应保留应用侧连接与并发上限，避免数据库过载。

## 最小示例

```ini
[pgbouncer]
pool_mode = transaction
max_client_conn = 200
default_pool_size = 20
reserve_pool_size = 5
reserve_pool_timeout = 3
```

