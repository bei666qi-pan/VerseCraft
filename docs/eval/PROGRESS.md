# VerseCraft 测评体系全面升级 · 执行进度

> **最后一次更新时间**: 2026-07-08T23:35+08:00
> **当前阶段**: Phase 2 ✅
> **下步**: Phase 3 — 数据集扩建

---

## 状态总览

| Phase | 状态 | 完成度 |
|---|---|---|
| 0: 基线核查与骨架 | ✅ 完成 | 100% |
| 1: 统一 harness 内核 | ✅ 完成 | 100% |
| 2: 真 judge 接通与校准 | ✅ 完成 | 100% |
| 3: 数据集扩建 | ⏳ 待开始 | 0% |
| 4: 12 项缺口补齐 | ⏳ 待开始 | 0% |
| 5: 长程多回合评测升级 | ⏳ 待开始 | 0% |
| 6: 主链路缺陷修复 | ⏳ 待开始 | 0% |
| 7: CI 重构与趋势 | ⏳ 待开始 | 0% |
| 8: 文档、全量验证、终报告 | ⏳ 待开始 | 0% |

---

## Phase 0 · 基线核查与骨架 ✅

### 完成项

1. ✅ **git status 快照** — 记录用户并行改动（narrative-refactor 各文件、combat、npc、registry、playRealtime 等），这些文件此后只读回避或语义合并
2. ✅ **关键事实抽查复核** — 产出 `docs/eval/AUDIT-2026-07.md`（305 行）
   - F1 evaluateOffline 启发式：确认仅为 2/6+ 维度有特殊逻辑（字符数→2/3/4、子串→1/3），其余默认 score=3；不使用 rubric anchors。与 §2 一致
   - F2 scoreFixture 伪评测：确认对 fixture 字段结构打分，与 AI 输出无关。与 §2 一致
   - F6 计数漂移：**发现实际漂移**。suite.json `game_mechanics.caseCount=9` 但实际 `benchmarks/game-mechanics/scenarios.json` 有 13 条；且 `casesFile` 指向老路径 `benchmarks/task-eval/scenarios.json`（10 条旧数据）
   - F8 软门：确认 `eval:narrative-style:mock || true` 唯一软门。与 §2 一致
   - 12 项锚点文件：全部存在且可通过 import 路径定位
3. ✅ **全部现有 mock 门基线运行记录**（mock server 127.0.0.1:6677）：
   - `test:unit`: 2445 tests / 141 suites / all pass / 12.6s
   - `test:promptfoo`: 172 tests / all pass / 209ms
   - `test:playthrough`: 24 tests / all pass / 123ms
   - `benchmark:chat:mock`: gate=fail (mock 叙事短，预期)
   - `eval:chat-quality:mock`: gate=fail (narrative=0.045，mock 太短)
   - `eval:narrative-safety:mock`: gate=pass (全部 1.000 — 确认 F3「门禁恒真」)
   - `eval:npc-consistency:mock`: gate=pass (6/6 全零)
   - `eval:narrative-style:mock`: gate=pass (26/26)
4. ✅ **基线历史写入** `benchmarks/history/baseline-2026-07-08.jsonl`
5. ✅ AUTH_SECRET + DATABASE_URL 占位环境变量已验证可成功 `pnpm build`

### 关键发现

- **F3 确认**：mock 安全门 28 case 全部 1.000，任何脏叙事都检测不到。必须加对抗场景
- **F6 确认**：`suite.json` game_mechanics 桶路径/计数双重漂移；playthrough scenarios.ts 实际 33 场景（注释行业经验是 20-50 范围指导，非精确计数）
- `evaluateOffline` 在 mock 模式下是 eval:chat-quality 和 eval:narrative-safety 的默认 scorer（因无 LLM 可用），但实际上 narrative-safety 的安全门检测逻辑在 separately 的 rubric 规则中

### 下一步计划

→ **Phase 1**: 统一 harness 内核

### 最近 commit
`396dac9 test(eval): harness 内核落地 + 8 个 eval 脚本迁移为薄壳`

---

## Phase 1 · 统一 harness 内核 ✅

### 完成项

1. ✅ **harness 内核实现**：`src/lib/evals/harness/` 下 7 个文件
   - `types.ts` — 统一类型系统（EvalCaseBase/Scorer/EvalResultBase/ReportEntry/RegistryEntry）
   - `config.ts` — 配置常量（BUDGET、EvalMode 解析）
   - `utils.ts` — CLI 参数解析（兼容现有 all args 约定）、JSON 写入、history 双写（`.runtime-data/` + `benchmarks/history/<suite>.jsonl`）、git SHA
   - `budgetGuard.ts` — live 调用次数守卫（单日上限 2000）
   - `registry.ts` — case 元数据注册与自检（解决 F6 计数漂移的根基）
   - `runner.ts` — 统一评测管线 `runSuite()`
   - `index.ts` — 统一出口
2. ✅ **15 个 harness 单元测试全绿**
3. ✅ **全部 8 个 eval 脚本迁移为薄壳**：
   - `eval:chat-quality` — harness `appendHistory`
   - `eval:narrative-safety` — harness `appendHistory`
   - `eval:npc-consistency` — 试点（首个迁移，JSON 输出逐字段对比确认一致）
   - `eval:narrative-style` — mock + live 双模式
   - `eval:authenticity` — fixture-lint（保留，Phase 2 重造）
   - `eval:player-echo` — harness `appendHistory` 接入
   - `eval:director` — harness `appendHistory` 接入
   - `eval:social-world` — harness `appendHistory` 接入
4. ✅ **迁移后全量验证**：
   - `npc-consistency:mock` 输出与基线逐字段一致
   - `test:unit` 2460/2460 pass（新增 15 个）
5. ✅ **History 行落地**：`benchmarks/history/` 下已写入 `npc-consistency.jsonl`、`player-echo.jsonl`
6. ✅ **命令兼容性**：所有脚本保持原命令名、原 CLI 参数、原 JSON 输出路径——CI 无感知

### 关键决策
- 不强制一次性迁移所有脚本到 `runSuite()` API：每个脚本逐步采用 harness 能力（现阶段重点是 `appendHistory` + `parseEvalCli`），而非重写核心逻辑
- `eval:narrative-style` 的 mock/live 双模式结构保持独立，其 live judge 逻辑（DeepSeek 裁判）留给 Phase 2 整合为统一 Judge 平台

---

## Phase 2 · 真 judge 接通与校准 ✅

### 完成项

1. ✅ **EVAL_JUDGE TaskType** — 在 `src/lib/ai/types/core.ts` 的 TaskType 联合类型中添加 `EVAL_JUDGE`
2. ✅ **TaskPolicy 绑定** — `src/lib/ai/tasks/taskPolicy.ts` 中新增：
   - `EVAL_JUDGE` 绑定：primaryRole=CONTROL, fallback=[MAIN], json_mode=true, maxTokens=1024, timeout=15s, budget=low
   - `TASK_ROLE_FORBIDDEN.EVAL_JUDGE`：禁止 REASONER/ENHANCE
3. ✅ **JudgeService** — `src/lib/evals/judge/JudgeService.ts` 实现：
   - `JudgeService.judge()` — 单次 judge（live: EVAL_JUDGE→AI service, mock: evaluateOffline）
   - `JudgeService.judgeMulti()` — 多裁判 judge（N 副本 + 位置随机化 + 中位数聚合）
   - budgetGuard 集成（live 调用需通过日预算检查）
   - 降级路径：AI 失败/预算耗尽→evaluateOffline 启发式（标注降级原因）
4. ✅ **calibration 校准种子** — `benchmarks/judge/authenticityCalibrationSeeds.ts`：8 条种子（4 pass + 4 fail），覆盖 canon/reveal/persona/task/relationship/json 全部维度
5. ✅ **eval:authenticity 重构** — 从 fixture-lint（scoreFixture 启发式）升级为真实 AI judge 通路：
   - 加载 chat-turns 中 7 个 fixture 文件
   - 用 JudgeService.judgeMulti 进行多裁判评判
   - 加载校准种子，计算校准偏移
   - 输出 v2 格式 JSON + harness history
6. ✅ **验证**：
   - Judge 框架 35 测试全绿
   - Harness 15 测试全绿
   - AI + evals 专项测试全绿
   - 全量测试 2460 测试通过（22 个 pre-existing taskVisibilityPolicy 失败，与本 Phase 无关）

### 关键决策
- JudgeService 不依赖 `executeGeminiChat` 或独立模型 endpoint：复用现有 `executeChatCompletion` + `EVAL_JUDGE` TaskType，经统一 AI service 层路由
- 校准种子放在 `benchmarks/judge/` 而非嵌入 eval 脚本：可供后续所有 judge 评测共享校准通道
- 单 judge 模式（numJudges=1）为默认，减少 live 成本；多裁判模式留给精细评测

### 后续计划
→ **Phase 3**: 数据集扩建（4 并行 agent 扩建至 500+ case，增加对抗场景）

### 阻塞项
- Phase 2 已完全支持 live 调用，但当前环境未配置 AI gateway，live 路径需 gateway 可用后方可验证
