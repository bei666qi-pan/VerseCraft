# AI 多服务与多模型总览

VerseCraft 支持多个 OpenAI 兼容服务，以及知识检索用的火山多模态向量服务。配置入口是 `/admin` → “AI 管理”。

## 必读索引

| 主题 | 文档 |
|------|------|
| 服务、Key、模型、用途主备 | [`ai-gateway.md`](ai-gateway.md) |
| 运行时架构 | [`ai-architecture.md`](ai-architecture.md) |
| 熔断与降级 | [`ai-fallback.md`](ai-fallback.md) |
| 成本、缓存与观测 | [`ai-governance.md`](ai-governance.md) |
| 环境变量 | [`environment.md`](environment.md) |
| 故障排查 | [`troubleshooting-ai.md`](troubleshooting-ai.md) |

## 关键边界

- 后台用途名称面向运营人员；内部 `main/control/enhance/reasoner/writer` 仅作为安全和兼容字段。
- 每个用途可配置一个主用和多个备用。认证失败或服务级限流跳过该服务，模型不兼容只跳过当前模型。
- 玩家故事生成不会路由到 `reasoner` / `enhance`。
- 费用来自管理员填写的人民币单价和调用时快照，未填写单价时只显示 Token。
- 已保存 Key 永不回显，只展示末四位；Key 为空表示保留原值。
- 配置切换不重启，新请求五秒内可见；进行中的请求固定原快照。

## 自动化测试

```bash
pnpm test:unit
pnpm test:admin:api
pnpm test:e2e:contract
pnpm benchmark:chat:mock
```

真实服务连通和向量维度通过后台“测试”动作验证；测试失败不会覆盖当前配置。
