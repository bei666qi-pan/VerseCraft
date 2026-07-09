# VerseCraft 结局系统测试计划

本文列出结局系统的自动化与手动验收范围。新增结局逻辑必须优先覆盖纯函数，再覆盖 store 接入，最后覆盖真实玩家路径。

## 单元测试列表

### Chapter Completion

文件：

- `src/lib/chapters/engine.test.ts`

覆盖：

- chapter-1 在 localReady 下完成。
- chapter-2 在 localReady 下完成。
- `closeDecision` 仍然可以完成章节。
- `suppressCompletion=true` 时不完成。
- `isDeath=true` 时不完成。
- 未知 beat id 不崩溃。
- completed chapter 不重复完成。

### Escape Mainline

文件：

- `src/lib/escapeMainline/escapeMainline.test.ts`

覆盖：

- `final_window_open` + 完整条件 + 真出口动作 => `escaped_true`。
- `final_window_open` + 完整条件 + 代价条件 => `escaped_costly`。
- `final_window_open` + 假出口动作 => `escaped_false`。
- `final_window_open` + 过期 => `doomed`。
- `final_window_open` + 非最终动作 => 保持 `final_window_open`。
- B2 presence alone 不触发 `true_escape`。
- `escaped_*` 后再次调用保持原结局，不回退。
- `computeEscapeOutcomeForSettlement(...)` 返回稳定 outcome。

### Ending Rules

文件：

- `src/lib/endings/rules.test.ts`

覆盖：

- death 优先级最高。
- resolved turn death 即使 sanity 未归零也触发 death。
- `escaped_true` 不被 doom 覆盖。
- `escaped_costly` 不被 doom 覆盖。
- `escaped_false` 不被 doom 覆盖。
- `survivalHours >= 240` 触发 doom。
- `day=10 hour=5` 触发 doom，不要求精确 `day=10 hour=0`。
- abandon 在无更高优先级结局时成立。
- `buildEndingIdempotencyKey(...)` 使用 `runId + outcome + detectedAtTurn`。

### Ending State Machine

文件：

- `src/lib/endings/stateMachine.test.ts`

覆盖：

- `TURN_COMMITTED` 从 `playing` 进入 `eligible`。
- 最终动作和最终叙事按顺序进入 pending/committing。
- `settlement_ready` 必须拥有 `settlementSnapshot`。
- `settled` 后不可回到 `playing`，除非 `RESET_FOR_NEW_RUN`。
- 同一 `idempotencyKey` 不重复创建 settlement snapshot。
- 只有 `settlement_ready` 可以记录 redirected timestamp。

### Final Narrative Protocol

文件：

- `src/lib/endings/finalNarrativePrompt.test.ts`

覆盖：

- 本地 fallback 生成 bounded final narrative。
- AI finale 缺字段或协议不完整时 fallback。
- prompt 明确要求 `ending_finale`。
- options 只能是：
  - 查看结算
  - 导出本局写作稿
  - 回看全文

### Ending Telemetry / Debug

文件：

- `src/lib/endings/telemetry.test.ts`
- `src/lib/debug/narrativeSystemsDebugRing.test.ts`

覆盖：

- telemetry payload 包含必填字段。
- blocked playing state 可以表达“未触发结局”的原因。
- telemetry idempotency key 稳定。
- debug ring 最近 20 条。
- debug ring 只复制结局摘要字段，不复制隐藏剧情正文。

### Store / Snapshot / Settlement

文件：

- `src/store/useGameStore.ending.test.ts`
- `src/lib/state/snapshot/builder.test.ts`
- `src/lib/state/snapshot/migration.test.ts`
- `src/lib/settlement/rules.test.ts`

覆盖：

- 旧存档 migration 初始化 `endingState`。
- death / true_escape / doom 进入 `settlement_ready`。
- 重复 evaluate 不重复 snapshot。
- `resetForNewGame` 清空 ending state。
- snapshot 写入 save slot 和 `RunSnapshotV2`。
- settlement rules 对五类 outcome 给出不同标题、caption 和 grade。

## Property-Based Tests

文件：

- `src/lib/endings/endings.property.test.ts`

不变量：

- 任意输入只要 `sanity <= 0` 或 `isDeath=true`，必须返回 `death`。
- 任意 time 下，`escaped_true` / `escaped_costly` / `escaped_false` 不被 doom 覆盖。
- 任意 `settled` 状态，普通 `TURN_COMMITTED` 不得让它回到 `playing`。
- 任意 transition 如果进入 `settlement_ready`，必须存在 `settlementSnapshot`。
- 相同 `runId + outcome + detectedAtTurn` 多次生成 snapshot 的 `settlementId` 一致。
- 普通 playing 状态无结局条件时不得误触发。

运行命令：

```bash
pnpm test src/lib/endings/endings.property.test.ts
```

## Playwright E2E

文件：

- `e2e/ending-death.spec.ts`
- `e2e/ending-doom.spec.ts`
- `e2e/ending-true-escape.spec.ts`
- `e2e/ending-costly-escape.spec.ts`
- `e2e/ending-false-escape.spec.ts`
- `e2e/fixtures/endingMocks.ts`
- `e2e/chapter-flow.spec.ts`

结局 E2E 要求：

- 所有测试 mock `/api/chat`。
- 不调用真实大模型。
- 每个测试独立初始化 localStorage / IndexedDB。
- 五类 outcome 都从 `/play` 到 `/settlement`。
- 非 death 结局必须经过最终选择面板和最终叙事 sheet。
- death 可以直接进入最终叙事或结算。

每个 ending E2E 验证：

- URL 最终是 `/settlement`。
- 页面有结局标题。
- 页面有评级。
- 页面有存活时间。
- 页面有导出本局写作稿按钮。
- 没有普通行动输入框。
- 没有普通下一步 options。
- 刷新后 outcome 不变。

章节 E2E 验证：

- 章节完成 sheet 出现。
- 回顾上一章不回滚存档。
- 移动端阅读壳层仍保留现有导航与裁剪入口约束。

运行命令：

```bash
pnpm exec playwright test e2e/ending-*.spec.ts
pnpm exec playwright test e2e/chapter-flow.spec.ts
```

## 收尾验收命令

阶段 10 要求运行：

```bash
pnpm test
pnpm exec playwright test e2e/ending-*.spec.ts
pnpm exec playwright test e2e/chapter-flow.spec.ts
pnpm lint
```

如果全量 `pnpm test` 或 `pnpm lint` 因仓库既有无关问题失败，需要在最终报告中列出失败命令、失败位置和是否触达本次结局系统文件。

## 手动验收 Checklist

### 通用

- [ ] 新局开始后普通回合仍可提交。
- [ ] 普通章节推进仍能显示章节提示和章末 sheet。
- [ ] 旧存档加载不丢 logs、chapterState、escapeMainline。
- [ ] 结局触发后普通 options 不再生成。
- [ ] 结局触发后普通输入不可继续提交。
- [ ] `/settlement` 刷新后 outcome、grade、finalNarrative 不变。
- [ ] 返回首页或新一局前不会重复提交 history。

### death

- [ ] `is_death=true` 或 sanity 归零能进入 death。
- [ ] 结算页展示死因、地点、最后行动。
- [ ] 评级通常为 `E/D`。

### doom

- [ ] `day=10 hour>0` 能触发 doom。
- [ ] `survivalHours >= 240` 能触发 doom。
- [ ] doom 不生成普通 options。

### true_escape

- [ ] `final_window_open` 下，完整 required conditions + 真出口动作进入 `escaped_true`。
- [ ] 结算页展示“真正逃离”。
- [ ] 评级为 `S`。

### costly_escape

- [ ] 存在 cost/sacrifice 条件时进入 `escaped_costly`。
- [ ] 结算页展示“代价逃离”。
- [ ] 文案不否认已经逃出。

### false_escape

- [ ] 假出口 / 镜面出口动作进入 `escaped_false`。
- [ ] false lead 未排除时不会误判 true escape。
- [ ] 结算页展示“假逃离”。

### 观测

- [ ] `ending_eligible_detected` 可定位 outcome 和 reasons。
- [ ] `ending_blocked` 可定位没有结局的 blockers。
- [ ] `ending_settlement_snapshot_created` 可定位 settlementId。
- [ ] `ending_settlement_history_submitted` 区分成功/失败。
- [ ] 开发环境打开 debug ring 时，只看到摘要，不看到 DM-only 隐藏真相。
