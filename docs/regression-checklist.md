# 多模型改造 — 回归场景清单

**自动化**：`pnpm test:unit`（关键路由/配置/流解析/网关契约）；`pnpm test:e2e:contract`（CI 同款：无网关降级 SSE + `/play` 访客冒烟）。  
**配置自检**：`pnpm verify:ai-gateway`（可选 `VERIFY_AI_GATEWAY_STRICT=1`）；真连通可选 `pnpm probe:ai-gateway`。  
**人工**：下列场景在 staging / 预发走一遍；记录环境与 `AI_OPERATION_MODE`。

架构与变量以 **`docs/ai-gateway.md`** 为准；所有调用经 **one-api**，业务侧只认 **逻辑角色**（`main` / `control` / `enhance` / `reasoner`）。

## 1. 玩家普通对话

- [ ] `/play` 输入探索类指令，SSE 正常结束，`__VERSECRAFT_FINAL__` 或等价收尾事件正常。
- [ ] 响应头（若开启 `AI_EXPOSE_ROUTING_HEADER=1`）中 `logicalRole` / 上游模型名为链上其一；玩家链中**不得**出现 `reasoner` 角色（除非误配 `AI_PLAYER_ROLE_CHAIN`）。

## 2. 战斗结算

- [ ] 进入战斗相关叙事，`COMBAT_NARRATION` 或同链路逻辑返回合法 JSON（属性/伤害字段符合前端解析）。

## 3. 任务推进

- [ ] 连续多轮推进剧情，状态机阶段 `idle → waiting_upstream → streaming_body → turn_committing` 无死锁。

## 4. 指令解析 / 控制面

- [ ] `PLAYER_CONTROL_PREFLIGHT`（`control` 角色优先）失败时可 fallback 到 `main`（链与密钥/one-api 渠道均可用时）；控制面 JSON 可被解析。

## 5. 敏感内容预筛

- [ ] `SAFETY_PREFILTER` 路径可执行；本地审核为规则引擎（`MODERATION_PROVIDER=auto`），无第三方云审核服务依赖。

## 6. 关键剧情场景增强

- [ ] 在高价值场景 + 控制面 `enhance_scene` 等条件下，可选触发 **`enhance` 角色**上游；平凡回合不应稳定消耗增强配额（见 `ai-governance.md` 门控与预算）。

## 7. 模型失败后的自动接管

- [ ] 模拟 one-api 429/5xx 或关闭对应渠道：链应尝试下一候选角色，直至 `CHAIN_EXHAUSTED`；用户可见文案为中文友好提示。

## 8. 离线任务边界（可选，后台/脚本环境）

- [ ] `WORLDBUILD_OFFLINE` / `DEV_ASSIST` 等可使用 **`reasoner` 角色**；确认这些入口**不**挂在玩家实时 SSE 主路径上。

## 9. 环境切换（本地 one-api ↔ 生产 one-api）

- [ ] 仅改 `AI_GATEWAY_BASE_URL` / `AI_GATEWAY_API_KEY` / `AI_MODEL_*`（与 Coolify 或 `.env.local` 同源键名），**无**代码分支差异；对话与任务类型均可跑通。

## 10. 逻辑模型名切换

- [ ] 在 one-api 中将某渠道映射到新上游后，若 **模型 id 字符串不变**，VerseCraft **零改**；若 id 变更，仅更新对应 **`AI_MODEL_*` env**，业务模块无需改动。
