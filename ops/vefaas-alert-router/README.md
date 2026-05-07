# veFaaS Alert Router

这个函数是 VerseCraft auto-ops 链路的告警入口，只负责快速接收、验签、去重、分类和触发后续动作。

## 本地运行

```bash
AUTOOPS_ALERT_ROUTER_SECRET=dev-secret AUTOOPS_ALERT_ROUTER_DRY_RUN=1 node ops/vefaas-alert-router/index.mjs
curl -X POST "http://127.0.0.1:8787/autoops/alert?secret=dev-secret" \
  -H "content-type: application/json" \
  -d '{"source":"external-health","alert_type":"app_health_failed","resource_id":"local"}'
```

## veFaaS 入口

导出函数：

```js
export async function handler(event, context)
```

APIG 路由建议配置：

- Method: `POST`
- Path: `/autoops/alert`
- Timeout: 尽量保持默认短超时，告警回调必须快速返回 200
- Secret: query `?secret=`、header `x-autoops-secret` 或 `Authorization: Bearer`

## 环境变量

最小必需：

- `AUTOOPS_ALERT_ROUTER_SECRET`
- `GITHUB_TOKEN`
- `AUTOOPS_REPO=bei666qi-pan/VerseCraft`

快路径需要：

- `COOLIFY_BASE_URL`
- `COOLIFY_API_KEY`
- `COOLIFY_APP_UUID`
- `VOLC_AK`
- `VOLC_SK`
- `VOLC_REGION`
- `VOLC_ECS_INSTANCE_IDS`

## 部署包

运行：

```bash
pnpm autoops:provision
```

脚本会生成 `.ops/autoops/runtime/vefaas-alert-router.zip` 和 `vefaas-provision-report.json`。如果当前火山账号的 veFaaS/APIG OpenAPI 参数无法自动确认，按报告中的控制台步骤上传 zip 并绑定 APIG。
