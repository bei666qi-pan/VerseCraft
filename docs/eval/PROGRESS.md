# VerseCraft 测评体系全面升级 · 执行进度

> **最后一次更新时间**: 2026-07-08T14:30+08:00
> **当前阶段**: Phase 0 ✅
> **下步**: Phase 1 — 统一 harness 内核

---

## 状态总览

| Phase | 状态 | 完成度 |
|---|---|---|
| 0: 基线核查与骨架 | ✅ 完成 | 100% |
| 1: 统一 harness 内核 | ⏳ 待开始 | 0% |
| 2: 真 judge 接通与校准 | ⏳ 待开始 | 0% |
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
`ca9331f test(npc): 全链路测试覆盖 — extractChineseNames 12 cases + narrative name whitelist`

---

## Phase 1 · 统一 harness 内核

**目标**：落 `src/lib/evals/harness/{types,runner,scorers,reporter,registry,budgetGuard,history}.ts` + 单测；迁移所有 eval 脚本为薄壳。

**具体步骤**：
1. 设计 harness 类型体系（EvalCase / EvalResult / Runner / Scorer / Reporter）
2. 实现核心 runner 和 scorers（rule-based + feature-heuristic + LLM judge）
3. 实现 history reporter（双写 `.runtime-data/` + `benchmarks/history/`）
4. 迁移 `eval:chat-quality` 到 harness 薄壳
5. 迁移其他 6 个 eval 脚本
6. 迁移前后 JSON 输出逐字段 diff 验证

**阻塞项**：无

---
