# NPC 认知隔离系统 · 上线灰度与验收清单

## 1. 功能清单

| 能力 | 说明 | 主开关 / 兼容旧名 |
|------|------|-------------------|
| 前置认知护栏 | Lore/会话事实合并、越界检测、告警包、actor 权限化记忆块 | `VERSECRAFT_ENABLE_EPISTEMIC_GUARD`（默认开） |
| 生成后校验器 | narrative/options/结构化字段规则擦洗与模板改写 | `VERSECRAFT_ENABLE_EPISTEMIC_VALIDATOR`；未设置时读 `VERSECRAFT_EPISTEMIC_POST_GUARD` |
| NPC 情绪残响 | 玩法向 performanceTags，不含命题事实 | `VERSECRAFT_ENABLE_NPC_RESIDUE`；未设置时读 `VERSECRAFT_EPISTEMIC_RESIDUE_GAMEFEEL` |
| 欣蓝强记忆例外 | 牵引锚点策略 + validator 对 world 的放宽 | `VERSECRAFT_ENABLE_XINLAN_STRONG_MEMORY`（默认开） |
| 调试日志 | `[epistemic]` 结构化 info（勿在生产长期全开） | `VERSECRAFT_EPISTEMIC_DEBUG_LOG`（默认关） |

实现入口：`src/lib/epistemic/featureFlags.ts`；`buildNpcEpistemicProfile` 已统一套用欣蓝 rollout 门控。

## 2. 风险与回滚策略

| 风险 | 缓解 | 回滚操作 |
|------|------|----------|
| 模型仍偶发越界 | 后置 validator 擦洗 | 保持 `VALIDATOR=1`；若误判增多再针对性调规则 |
| 提示词变长拖 TTFT | 快车道/minimal、事实条数上限 | 临时 `GUARD=0`（仅关事实+检测，记忆块仍分层） |
| 欣蓝牵引减弱/过强 | 独立 `XINLAN_STRONG_MEMORY` | `VERSECRAFT_ENABLE_XINLAN_STRONG_MEMORY=0` 一键降级为普通 NPC 策略 |
| 残响刷屏 | 概率门控 + `epistemic_residue_recent_uses` | `ENABLE_NPC_RESIDUE=0` |
| 观测噪声 |  analytics 中带 `epistemicRollout` 快照 | 对比 `chat_request_started` / `chat_request_finished` 的 `epistemicRollup` |

**硬回滚（全关认知增强）**：`GUARD=0`、`VALIDATOR=0`、`NPC_RESIDUE=0`、`XINLAN_STRONG_MEMORY=0`（按环境逐步组合，避免一次性全关难以定位）。

## 3. 灰度发布建议

1. **阶段 0**：预发全开 + `EPISTEMIC_DEBUG_LOG=1` 短窗口，核对 `epistemicRollup` 与日志。
2. **阶段 1**：生产 `VALIDATOR=1`、`GUARD=1`，残响 `NPC_RESIDUE=1` 可先 10% 流量（按实例/用户分桶需外围网关配合；单机可先全量观察指标）。
3. **阶段 2**：确认 `validatorTriggered` / `rewriteTriggered` 比例稳定后，保持默认全开。
4. **阶段 3**：将 `EPISTEMIC_DEBUG_LOG` 仅保留在诊断账号或开发环境。

## 4. 验收案例（自动化）

运行：`pnpm test:unit`（覆盖 `validator.test.ts`、`residuePerformance.test.ts`、`epistemicMatrix.test.ts`、`featureFlags.env.test.ts`、`goldenDialogueScenarios` 驱动场景）。

人工 spot-check：对照 `src/lib/epistemic/goldenDialogueScenarios.ts` 中 `intent` 字段跑 3～5 条真实对话。

## 5. 观察指标（`chat_request_finished.payload`）

- **`epistemicRollup`**（对象）  
  - `rolloutFlags`：五项开关快照  
  - `actorNpcId`  
  - `actorKnownFactCount` / `publicFactCount` / `epistemicFactCount`  
  - `anomalyDetected` / `anomalySeverity`  
  - `validatorTriggered` / `rewriteTriggered` / `responseSafe`  
  - `promptCharDelta`（相对未权限化全局记忆的估算差，见 metrics）  
  - `firstChunkLatencyMs`（与顶层 `firstChunkLatencyMs` 同源，便于子面板）  
  - `dynamicCharLen` / `actorScopedMemoryBlockChars`  
- **`epistemicPostValidator`**：后置校验详细 telemetry（若本回合运行过 guard 路径）

`chat_request_started.payload.epistemicRollout` 与终帧 rollup 可对齐同一请求。

## 6. 未来二期（本期故意不做）

- 按用户分桶的动态配置服务（远程开关），本期用 env 即可。
- 二次 LLM 裁判或重写（成本高、脆弱），本期坚持规则 + 模板。
- 全量 NPC 心核与残响的细粒度耦合（`npcHeart` 深度接线），本期仅服务端标签层。
- 细粒度「每 NPC 残响曲线」学习/调参，本期用确定性阈值与轮换环足够上线。
