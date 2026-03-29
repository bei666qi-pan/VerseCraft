# NPC 认知：生成后校验器（Post-Guard）

## 为什么必须有后置校验

生成前限制（prompt 内 allowed / forbidden、异常包、欣蓝策略等）能把**大部分**越界压下去，但大模型仍会偶发「偷跑」：在 narrative、选项或结构化回写里直接确认 NPC 不可知事实，或抢跑世界真相。

后置校验是**最后一道保险丝**：在 JSON 已生成、即将进入 `resolveDmTurn` 与前端之前，用**确定性规则**再扫一遍。它不依赖第二次大模型调用，失败面小、行为可回归测试。

## 与 Pre-check 如何协同

| 阶段 | 职责 |
|------|------|
| **Pre-check（prompt / anomaly）** | 缩小模型犯错概率：注入可引用事实边界、异常时要求迟疑/追问，从源头降噪。 |
| **Post-check（本模块）** | 假设模型仍可能犯错：对**实际输出**做子串命中、确认语气、结构化字段擦洗与模板化改写。 |

两者是「生成前限制 + 生成后审查」的双保险：前置省 token、后置兜底防出戏。

## 这是保险丝，不是额外负担

- **无二次 LLM**：规则扫描 + 必要时模板改写 / 子串 scrub，延迟在毫秒级。
- **不接在流式首包路径**：仅在 `runStreamFinalHooks` 中、流结束后对完整 DM JSON 执行，**不影响 TTFT**。
- **结构化主链路不变**：仍输出同一套 DM JSON 字段；仅在违规时改写 `narrative` / `options` 或擦洗 `codex_updates` / `task_updates` / `clue_updates` 中的文本槽位。
- **可关闭**：`VERSECRAFT_ENABLE_EPISTEMIC_VALIDATOR`（默认开启）；若未设置该变量，则回退读取 `VERSECRAFT_EPISTEMIC_POST_GUARD`（兼容旧部署）。

## 实现位置

- 逻辑：`src/lib/epistemic/validator.ts`、`src/lib/epistemic/rewrite.ts`
- 接线：`src/app/api/chat/route.ts` 的 `runStreamFinalHooks`  
  - 在首次 options 补救之后、`resolveDmTurn` **之前**执行一次；  
  - 若 post-resolve 再次 `generateOptionsOnlyFallback`，会**再跑**一次 guard 并重新 `resolveDmTurn`，避免补选项引入新泄露。

## 遥测（`chat_request_finished`）

载荷中附带 `epistemicPostValidator`（与 `security_meta.epistemic_post_validator` 同源字段语义一致），主要包括：

- `validatorTriggered`：本回合是否发生了**实质性干预**（改写、泄露分类非 `none` 等）。
- `leakType`：`none` / `private_fact_leak` / `world_truth_premature` / `overreach_acceptance` / `overconfident_confirmation`
- `rewriteTriggered`、`rewriteReason`
- `finalResponseSafe`：当前实现恒为 `true`（表示已尽力收敛到安全表述）
- `involvedFields`：如 `narrative`、`options`、`codex_updates[0].detail` 等

仅在发生干预时向 `security_meta` 写入 `epistemic_post_validator`，避免无污染回合膨胀 JSON。

## 欣蓝例外

与前置策略一致：对 `N-010`（欣蓝）从禁止表中剔除 `scope===world` 与 `sourceType===system_canon`，避免把她允许牵引的正史表述误当泄露；**玩家独知、其他 NPC 私域**仍会被拦。
