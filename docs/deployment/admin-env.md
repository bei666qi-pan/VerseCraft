# 后台部署环境变量

## 必需变量

| 变量 | 用途 | 暴露范围 |
| --- | --- | --- |
| `ADMIN_PASSWORD` | 管理员登录 `/saiduhsa`，生成 shadow session | 仅服务端 |
| `ADMIN_CRON_SECRET` | `/api/admin/cron/*` 调度调用鉴权 | 仅服务端/调度器 |
| `DATABASE_URL` | 后台指标、审计日志、聚合数据 | 仅服务端 |

`ADMIN_PASSWORD` 与 `ADMIN_CRON_SECRET` 必须分离。Cron 不接受 `ADMIN_PASSWORD`，生产环境缺少 `ADMIN_CRON_SECRET` 时拒绝执行。

## 可选变量

| 变量 | 用途 | 降级行为 |
| --- | --- | --- |
| `REDIS_URL` | 登录失败限流、部分实时能力 | 不可用时使用进程内限流 fallback |
| `AI_GATEWAY_*` / `OPENAI_*` | AI 运营洞察 | 未配置时返回本地 fallback 建议 |
| `VERCEL_GIT_COMMIT_SHA` / `GITHUB_SHA` | 系统健康部署版本 | 缺失时显示 `unknown` |

## Cron 调用

```bash
curl -X POST "https://<host>/api/admin/cron/rebuild-daily?days=7" \
  -H "x-cron-secret: $ADMIN_CRON_SECRET"
```

```bash
curl -X POST "https://<host>/api/admin/cron/safety-audit-cleanup" \
  -H "x-cron-secret: $ADMIN_CRON_SECRET"
```

不要在日志、CI 输出、工单或截图中打印 secret 值。

## 验证

- 未登录访问 `/api/admin/overview` 应返回 403。
- 使用错误 `x-cron-secret` 调用 cron 应返回 403。
- 使用 `ADMIN_PASSWORD` 作为 cron secret 也应返回 403，除非它碰巧与 `ADMIN_CRON_SECRET` 相同；生产配置必须避免相同值。
- 后台页面的系统健康 tab 不应显示任何 secret、完整数据库连接串或网关密钥。

## 回滚

- 只回滚代码时，`admin_audit_logs` 表可以保留。
- 如需临时停止 cron，移除外部调度器或撤销 `ADMIN_CRON_SECRET`。
- 如需恢复旧后台 UI，回滚包含 `AdminDashboardV2` 的提交即可。
