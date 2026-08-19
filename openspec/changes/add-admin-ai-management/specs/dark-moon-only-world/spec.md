## MODIFIED Requirements

### Requirement: 暗月在线回合契约保持兼容
系统 MUST 保持暗月 `/api/chat` 的 SSE、最终 DM JSON 收口、`keys_missing` 降级、状态提交、认知过滤、生成后校验和后台 world tick 契约。真实模型可用性 SHALL 来自已预热的后台 AI 服务配置，而不是旧 NewAPI/one-api 环境变量。

#### Scenario: AI 服务可用
- **WHEN** 暗月行动通过已启用并测试成功的故事生成服务获得正常模型响应
- **THEN** 系统继续以 status/data 帧流式返回，并以 `__VERSECRAFT_FINAL__` 提供权威结果

#### Scenario: AI 服务配置缺失
- **WHEN** 没有已预热的可用故事生成模型或密钥解密失败
- **THEN** 系统继续返回 `200 + text/event-stream`、`keys_missing` 状态和可解析 final

