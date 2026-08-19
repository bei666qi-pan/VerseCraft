# AI 管理上线前验收

当前 AI 配置事实源为 PostgreSQL + 进程内不可变快照。旧网关环境变量和 NewAPI/one-api 不再作为生产路由或回退来源。

上线前依次确认：

1. 应用 `drizzle/0019_admin_ai_management.sql`。
2. 设置并长期保存同一 32 字节 `AI_CONFIG_ENCRYPTION_KEY`。
3. 登录 `/saiduhsa` → “AI 管理”，添加服务、模型、人民币单价和用途候选。
4. 确认全部变化模型测试成功；向量模型维度与数据库列宽一致。
5. 验证主用失败时会尝试备用，无故事模型时仍返回既有 `keys_missing` SSE。
6. 运行 `pnpm test:e2e:contract` 与 `pnpm benchmark:chat:mock`。

不要把测试失败的服务强制写入生产，也不要用旧 secret 环境变量临时恢复路由。
