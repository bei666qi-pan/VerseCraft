# Options Regen 可观测性与灰度手册

本文档覆盖 `options_regen_only` 在当前仓库的真实实现、原因码、灰度开关、测试矩阵与回滚策略。

## 1) 真实链路（文件级）

1. 触发入口：`src/app/play/page.tsx` `requestFreshOptions()`
2. 请求用途：`clientPurpose: "options_regen_only"`，只刷新 options，不推进主回合
3. 服务端 fast path：`src/app/api/chat/route.ts` `if (clientPurpose === "options_regen_only")`
4. 输出形状：`src/app/api/chat/optionsRegenPayload.ts` `buildOptionsRegenResponse()`
5. 客户端落屏前处理顺序：
   - `normalizeRegeneratedOptions()`（去重/反复用）
   - `evaluateOptionsSemanticQuality()`（语义质量门）
   - repair pass（一次补缺口）
   - deterministic fallback（模板补齐）
   - `setCurrentOptions()`

## 2) 原因码（reason code）

前端可观测原因码定义在 `src/lib/play/optionsRegenObservability.ts`：

- `parse_failed`
- `duplicated_rejected`
- `anchor_miss_rejected`
- `generic_rejected`
- `homogeneity_rejected`
- `repair_pass_used`
- `fallback_used`

来源：

- 解析层失败（SSE 折叠后无可用对象）→ `parse_failed`
- 语义质量门拒绝项（`src/lib/play/optionsSemanticGuards.ts`）映射到拒绝原因码
- repair/fallback 命中时主动打码

展示策略：

- 不写入世界状态，不写入任务/剧情字段
- 仅开发态通过 `console.debug("[play][options_regen]", ...)` 输出
- 服务端响应可携带 `debug_reason_codes`（`optionsRegenPayload`），属于调试元信息

## 3) 为什么需要语义质量门

`options_regen_only` 是辅助请求，模型返回 4 条并不代表可用。真实问题是：

- 可能解析成功但动作空泛
- 可能字面不同但语义重复
- 可能与最近 narrative 脱锚
- 4 条可能严重同质化

因此在 `setCurrentOptions()` 前必须执行 `evaluateOptionsSemanticQuality()`，保证坏选项不上屏。

## 4) repair / fallback 触发规则

实现位置：`src/app/play/page.tsx`

- 首轮过滤后 `1~3` 条：触发 repair pass（`src/lib/play/optionsRepair.ts`）
  - 仅补缺口，不重写已有合格项
  - 仍走 `options_regen_only`
- repair 后仍 `<4`：触发 deterministic fallback（`src/lib/play/optionsFallback.ts`）
  - 基于 narrative 锚点、位置、任务摘要、轻量道具提示
  - 生成后仍需通过语义质量门

## 5) 灰度开关（客户端）

定义：`src/lib/rollout/versecraftClientRollout.ts`

- `NEXT_PUBLIC_VERSECRAFT_ENABLE_OPTIONS_REGEN_SEMANTIC_GATE`
- `NEXT_PUBLIC_VERSECRAFT_ENABLE_OPTIONS_REGEN_REPAIR_PASS`
- `NEXT_PUBLIC_VERSECRAFT_ENABLE_OPTIONS_REGEN_DETERMINISTIC_FALLBACK`

默认均为 `true`。关闭后行为：

- 关闭 semantic gate：只保留基础归一化，不做语义拒绝
- 关闭 repair pass：不足 4 条时跳过补缺口请求
- 关闭 deterministic fallback：repair 后仍不足不做模板补齐

## 6) 回归测试矩阵

### 语义与去重
- `src/lib/play/optionsSemanticGuards.test.ts`
  - 不重复 current/recent（含高相似）
  - narrative 锚定
  - 非泛化、非同质化

### repair / fallback
- `src/lib/play/optionsRepair.test.ts`
  - 缺口触发、missing count、repair reason
- `src/lib/play/optionsFallback.test.ts`
  - 门/锁/走廊场景
  - NPC 对话场景
  - 风险逼近/潜行场景

### 服务端契约与隔离
- `src/app/api/chat/route.optionsRegenFastPath.contract.test.ts`
  - fast path 位置正确
- `src/app/api/chat/route.optionsRegenIsolation.contract.test.ts`
  - fast path 在 `resolveDmTurn`/`persistTurnFacts` 之前返回，保证不推进剧情、不改世界状态

## 7) 回滚策略

1. 仅回滚语义门：关闭 `NEXT_PUBLIC_VERSECRAFT_ENABLE_OPTIONS_REGEN_SEMANTIC_GATE`
2. 仅回滚 repair：关闭 `NEXT_PUBLIC_VERSECRAFT_ENABLE_OPTIONS_REGEN_REPAIR_PASS`
3. 仅回滚 fallback：关闭 `NEXT_PUBLIC_VERSECRAFT_ENABLE_OPTIONS_REGEN_DETERMINISTIC_FALLBACK`
4. 全量回滚到旧路径：同时关闭以上三项开关并保留 `options_regen_only` fast path 基础能力

回滚不会影响主回合协议，也不会改变 SSE 形态。

