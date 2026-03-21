# 多模型改造 — 回归场景清单

**自动化**：`pnpm test:unit`（关键路由/配置/流解析/适配层）。  
**人工**：下列场景在 staging / 预发走一遍；记录环境与 `AI_OPERATION_MODE`。

## 1. 玩家普通对话

- [ ] `/play` 输入探索类指令，SSE 正常结束，`__VERSECRAFT_FINAL__` 或等价收尾事件正常。
- [ ] 响应头（若开启 `AI_EXPOSE_ROUTING_HEADER=1`）中实际模型为链上其一，且非 `deepseek-reasoner` / `MiniMax-*`。

## 2. 战斗结算

- [ ] 进入战斗相关叙事，`COMBAT_NARRATION` 或同链路逻辑返回合法 JSON（属性/伤害字段符合前端解析）。

## 3. 任务推进

- [ ] 连续多轮推进剧情，状态机阶段 `idle → waiting_upstream → streaming_body → turn_committing` 无死锁。

## 4. 指令解析 / 控制面

- [ ] `PLAYER_CONTROL_PREFLIGHT`（GLM 优先）失败时可 fallback 到 V3.2（有密钥时）；控制面 JSON 可被解析。

## 5. 敏感内容预筛

- [ ] `SAFETY_PREFILTER` 路径可执行；本地审核为规则引擎（`MODERATION_PROVIDER=auto`），无第三方云审核服务依赖。

## 6. 关键剧情场景增强

- [ ] 在高价值场景 + 控制面 `enhance_scene` 等条件下，可选触发 MiniMax 增强； mundane 回合不应稳定消耗 MiniMax。

## 7. 模型失败后的自动接管

- [ ] 临时关闭 DeepSeek 密钥或模拟 429：链应尝试下一候选（如 GLM），直至 `CHAIN_EXHAUSTED`；用户可见文案为中文友好提示。

## 8. 离线任务边界（可选，后台/脚本环境）

- [ ] `WORLDBUILD_OFFLINE` / `DEV_ASSIST` 等可使用 `deepseek-reasoner`；确认这些入口**不**挂在玩家实时 SSE 主路径上。
