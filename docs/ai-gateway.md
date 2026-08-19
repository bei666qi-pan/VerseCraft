# VerseCraft AI 服务管理

VerseCraft 的真实 AI 服务由 PostgreSQL 和后台 `/saiduhsa` 统一管理，不再依赖 NewAPI、one-api 或部署环境中的 URL、Key、模型名。生产环境只需提供 `AI_CONFIG_ENCRYPTION_KEY`，然后由管理员在“AI 管理”中添加服务、模型和用途候选顺序。

## 上线配置

1. 应用 `drizzle/0019_admin_ai_management.sql`。
2. 生成 32 字节随机部署主密钥，以 64 位 hex 或 base64 填入 `AI_CONFIG_ENCRYPTION_KEY`。该密钥不能更换或丢失，否则已保存的 API Key 将无法解密。
3. 登录 `/saiduhsa`，打开“AI 管理”，添加 OpenAI 兼容服务或火山多模态向量服务。
4. 填写模型后台名称、真实模型名、能力、向量维度和人民币单价。保存时系统会执行最小真实请求；全部通过才切换配置。
5. 在“用途与备用顺序”配置玩家故事生成、规则判断、文字润色、后台推演和知识检索。第一项是主用，后续是备用。

新请求会在五秒内使用新版本，进行中的回合继续使用启动时的绑定。服务可在没有备用时立即停用；相应功能会明确降级。

## 安全与用量

- Key 使用 AES-256-GCM 加密，后台和接口只返回末四位；编辑时 Key 留空表示保留原值。
- 生产地址必须是公开 HTTPS 地址。回环、私网、链路本地、云元数据、带凭据 URL 和重定向均会被拒绝。
- 用量记录不保存 prompt、玩家输入、叙事正文、Key 或供应商响应正文。
- 供应商未返回 Token 时才使用统一估算并在后台提示；人民币费用来自调用发生时的模型单价快照，不等同厂商账单。
- 调用明细保留 90 天，每日汇总长期保留。

## 测试模式与降级

`AI_PROVIDER=mock` 是唯一保留的环境驱动 AI 路由，用于测试、契约和基准。真实服务不读取 `AI_GATEWAY_*`、`AI_MODEL_*`、`VC_AI_DIRECT_*`、Kimi 注入变量或 `ARK_EMBEDDING_*`。

当后台快照未预热、主密钥缺失、Key 解密失败或没有故事模型时，`/api/chat` 仍返回 `200 + text/event-stream`、`X-VerseCraft-Ai-Status: keys_missing`、状态帧和权威终帧。

## 排障

- “系统尚未完成安全密钥配置”：检查 `AI_CONFIG_ENCRYPTION_KEY` 是否为同一 32 字节密钥。
- “连接未通过”：在 AI 管理中重新测试，确认 Key、公开 HTTPS 地址和真实模型名。
- “向量维度不一致”：将后台维度改为服务实际返回值，并确认数据库向量列兼容。
- 配置修改后未生效：等待最多五秒；检查数据库连接。Redis 仅加速失效通知，轮询会自动兜底。

核心实现位于 `src/lib/ai/managed/*`、`src/lib/ai/router/execute.ts` 和 `src/app/api/admin/ai-management/*`。
