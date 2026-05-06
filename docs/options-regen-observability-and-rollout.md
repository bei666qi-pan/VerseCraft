# Options Regen 可观测性与灰度手册

本文档覆盖 `options_regen_only` 在当前仓库的真实实现、原因码、灰度开关、测试矩阵与回滚策略。

## 0) 短链路预算与长期护栏

`options_regen_only` 是玩家继续行动入口的短链路能力，不是主叙事生成链路。它只整理下一步可点击行动，不推进回合、不写世界状态、不使用本地模板补齐。

长期目标与硬截止：

- P50 ≤ 2.5s
- P75 ≤ 4s
- P95 ≤ 6s
- P99 ≤ 8.5s
- 普通选项生成 client deadline：9s
- 开局选项生成 client deadline：11s
- 服务端 options-only 总预算：8s
- 首次模型请求 timeout：5s
- repair pass timeout：3s，且只能补缺口
- 本地兜底选项允许次数：0

失败策略：

- 超时、解析失败、语义质量门不通过，或 repair 后仍不足 4 条时，清空可点击选项。
- 用户只看到失败态：“这次没有整理出可靠选项，你可以手动输入行动，或再次尝试生成。”
- 不允许展示“观察四周 / 保持警惕 / 询问情况 / 确认退路”一类本地模板选项。
- `NEXT_PUBLIC_VC_TIGHT_TIMEOUTS=0` 只能影响主叙事流的宽 timeout，不能放宽 options-only 预算。

这些数值集中在 `src/lib/perf/waitingConfig.ts` 的 `OPTIONS_REGEN_LATENCY_BUDGET`。后续任何功能改动不得放宽上述预算，除非同步修改预算测试，并在 PR 中说明原因、风险和回滚方式。

## 1) 真实链路（文件级）

1. 触发入口：`src/app/play/page.tsx` `requestFreshOptions()`
2. 请求用途：`clientPurpose: "options_regen_only"`，只刷新 options，不推进主回合
3. 服务端 fast path：`src/app/api/chat/route.ts` `if (clientPurpose === "options_regen_only")`
4. 输出形状：`src/app/api/chat/optionsRegenPayload.ts` `buildOptionsRegenResponse()`
5. 客户端落屏前处理顺序：
   - `normalizeRegeneratedOptions()`（去重/反复用）
   - `evaluateOptionsSemanticQuality()`（语义质量门）
   - repair pass（一次补缺口）
   - `setCurrentOptions()`

## 2) 原因码（reason code）

前端可观测原因码定义在 `src/lib/play/optionsRegenObservability.ts`：

- `parse_failed`
- `duplicated_rejected`
- `anchor_miss_rejected`
- `generic_rejected`
- `homogeneity_rejected`
- `repair_pass_used`

来源：

- 解析层失败（SSE 折叠后无可用对象）→ `parse_failed`
- 语义质量门拒绝项（`src/lib/play/optionsSemanticGuards.ts`）映射到拒绝原因码
- repair 命中时主动打码

展示策略：

- 不写入世界状态，不写入任务/剧情字段
- 仅开发态通过 `console.debug("[play][options_regen]", ...)` 输出
- 服务端响应可携带 `debug_reason_codes`（`optionsRegenPayload`），属于调试元信息
- 客户端与服务端开发态均保留结构化 debug 事件，字段包括：
  - `options_regen_latency_ms`
  - `options_regen_trigger`
  - `options_regen_success`
  - `options_regen_failure_reason`
  - `options_regen_repair_used`
  - `options_regen_timed_out`
  - `options_regen_semantic_reject_codes`

## 3) 为什么需要语义质量门

`options_regen_only` 是辅助请求，模型返回 4 条并不代表可用。真实问题是：

- 可能解析成功但动作空泛
- 可能字面不同但语义重复
- 可能与最近 narrative 脱锚
- 4 条可能严重同质化

因此在 `setCurrentOptions()` 前必须执行 `evaluateOptionsSemanticQuality()`，保证坏选项不上屏。

## 4) repair 触发规则

实现位置：`src/app/play/page.tsx`

- 首轮过滤后 `1~3` 条：触发 repair pass（`src/lib/play/optionsRepair.ts`）
  - 仅补缺口，不重写已有合格项
  - 仍走 `options_regen_only`
- repair 后仍 `<4`：清空可点击选项并提示玩家重试或切换手动输入，不再使用模板补齐。

## 5) 灰度开关（客户端）

定义：`src/lib/rollout/versecraftClientRollout.ts`

- `NEXT_PUBLIC_VERSECRAFT_ENABLE_OPTIONS_REGEN_SEMANTIC_GATE`
- `NEXT_PUBLIC_VERSECRAFT_ENABLE_OPTIONS_REGEN_REPAIR_PASS`

默认均为 `true`。关闭后行为：

- 关闭 semantic gate：只保留基础归一化，不做语义拒绝
- 关闭 repair pass：不足 4 条时跳过补缺口请求

## 6) 回归测试矩阵

### 语义与去重
- `src/lib/play/optionsSemanticGuards.test.ts`
  - 不重复 current/recent（含高相似）
  - narrative 锚定
  - 非泛化、非同质化

### repair
- `src/lib/play/optionsRepair.test.ts`
  - 缺口触发、missing count、repair reason

### 服务端契约与隔离
- `src/app/api/chat/route.optionsRegenFastPath.contract.test.ts`
  - fast path 位置正确
- `src/app/api/chat/route.optionsRegenIsolation.contract.test.ts`
  - fast path 在 `resolveDmTurn`/`persistTurnFacts` 之前返回，保证不推进剧情、不改世界状态

## 7) 回滚策略

1. 仅回滚语义门：关闭 `NEXT_PUBLIC_VERSECRAFT_ENABLE_OPTIONS_REGEN_SEMANTIC_GATE`
2. 仅回滚 repair：关闭 `NEXT_PUBLIC_VERSECRAFT_ENABLE_OPTIONS_REGEN_REPAIR_PASS`
3. 全量回滚到旧路径：同时关闭以上两项开关并保留 `options_regen_only` fast path 基础能力

回滚不会影响主回合协议，也不会改变 SSE 形态。

