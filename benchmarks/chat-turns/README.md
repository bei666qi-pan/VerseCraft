# Chat 回合基准样本（`benchmarks/chat-turns`）

用于 **可验证闭环**：文档化真实玩法场景、手工/脚本回归时的输入模板，以及与 `analytics_events.payload`（`chat_request_finished`）对照的观测点说明。

**说明**：`ruleSnapshot` 字段反映服务端 `buildRuleSnapshot` 可能得到的典型形状，便于离线校验 JSON；线上仍以服务端计算为准。

| 文件 | 场景 | 主要观测 |
|------|------|----------|
| `normal_action.json` | 普通探索 | TTFT、主模型 tokens、预检未命中缓存时 latency |
| `npc_dialogue.json` | NPC 对话 | `high_value_scene`、增强门控、intent dialogue |
| `item_interaction.json` | 物品/调查 | 预检槽位、intent use_item / investigate |
| `combat_high_rules.json` | 战斗/高规则 | `in_combat_hint`、JSON 合规、风险标签 |
| `long_context.json` | 长上下文 | `stableCharLen`/`dynamicCharLen`、配额估算 |
| `preflight_sensitive.json` | 预检敏感 | `preflightOk`、`preInput`/`finalOutput` 拦截 |

## 本地预览

开发与基准脚本默认指向 **`http://localhost:666`**（见根目录 `package.json` 的 `pnpm dev`）。

## 脚本

`pnpm benchmark:chat-metrics`：默认打印各 fixture 体积与说明；若设置 `E2E_AI_LIVE=1`，对 `/api/chat` 发起请求并测量首包延迟（需本机网关可用，否则可能为降级 SSE）。
