# Auto-Ops 事故记录

事故 issue 由 `scripts/autoops/create-incident-issue.mjs` 创建或更新。标题格式：

```text
[auto-ops] <incident_key> <alert_type>
```

本地或 workflow 运行时证据位于 `.ops/autoops/runtime/`，该目录被 `.gitignore` 忽略，只保留 `.gitkeep`。

标准证据文件：

- `simulate-alert.json`
- `runtime-evidence.json`
- `codex-prompt.md`
- `healthcheck.json`
- `coolify-deployment.json`
- `coolify-restart.json`
- `volc-command-result.json`
- `rollback.json`
- `github-secrets-sync.json`
- `discovery-report.json`

事故关闭前至少确认：

- 告警是否停止重复触发。
- 健康检查是否恢复。
- 是否有 rollback 或 deploy 记录。
- 是否需要把新样本匿名化回流到 eval / benchmark cases。
