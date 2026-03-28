# 阶段 7：测试、回归、迁移与验收（上线准备）

本文档汇总「任务 / 手记 / 线索 / 道具 / DM 变更集」相关升级的**测试覆盖、兼容策略、可观测性与上线顺序**。

---

## 1. 变更文件总表（阶段 7 本轮）

| 文件 | 说明 |
|------|------|
| `src/lib/debug/narrativeSystemsDebugRing.ts` | 环形调试缓冲、`extractFilteredHintsFromTrace` |
| `src/lib/debug/narrativeSystemsDebugRing.test.ts` | 调试环与 trace 解析单测 |
| `src/features/play/components/NarrativeSystemsDebugPanel.tsx` | `/play` 浮层面板（仅 `NEXT_PUBLIC_VERSECRAFT_SYSTEMS_DEBUG=1`） |
| `src/app/play/page.tsx` | 回合 commit 后写入调试事件；挂载面板 |
| `src/lib/dmChangeSet/applyChangeSet.test.ts` | 扩展：降级线索、承诺目标、候选去重、关键物重复拒绝、发奖、`discovered_clues`→手记 |
| `src/lib/play/narrativeSystems.integration.test.ts` | 端到端纯函数链：线索→物证手记→承诺目标→完成→`repairNarrativeCrossRefs` |
| `src/lib/play/itemGameplay.test.ts` | 证据类 `buildItemUseStructuredIntent` 断言 |
| `.env.example` | 注释说明 `NEXT_PUBLIC_VERSECRAFT_SYSTEMS_DEBUG` / `VERSECRAFT_DM_CHANGESET_DEBUG` / 叙事 debug |

**既有相关文件（未改或前期已落地，验收时一并算入）**：`narrativeIntegrity.ts`、`useGameStore.ts`（读档完整性）、`clueMerge.ts` / `clueMerge.test.ts`、`resolveDmTurn.ts` / `resolveDmTurn.test.ts`、`settlementGuard.ts` / `settlementGuard.test.ts`、`taskV2.test.ts`、`playerChatSystemPrompt.ts`、`phase6-system-linkage.md` 等。

---

## 2. 测试清单与结果

### 2.1 单元测试（必做项映射）

| 需求 | 测试落点 | 状态 |
|------|-----------|------|
| 目标候选 → 正式目标判定 | `applyChangeSet.test.ts`：`promotes` / `demotes unseen` / `isObjectivePlayerPerceived` | 已覆盖 |
| 线索去重 | `clueMerge.test.ts`：`mergeCluesWithDedupe` | 已覆盖 |
| 物品去重（结算层） | `settlementGuard.test.ts`：同 id 消耗与发奖 | 已覆盖 |
| 行囊同 id 合并 | Store `addItems` 行为（产品代码）；集成测试中间接依赖发奖 id | 文档说明 |
| 关键物与手记 | `applyChangeSet.test.ts`：`matures_to_objective_id`；`integration`：`relatedItemIds` | 已覆盖 |
| 奖励 → 背包/仓库 | `applyChangeSet.test.ts`：`I-C12`；`page.tsx` 路径需手工/E2E | 单测 + 手工 |
| 证据物使用逻辑 | `itemGameplay.test.ts`：意图文案 + 选项注入 | 已覆盖 |
| 承诺目标 | `applyChangeSet.test.ts`：`npc_promises` + `goalKind: promise` | 已覆盖 |
| 存档恢复一致性 | `narrativeIntegrity.test.ts`；`integration` 收尾 `repairNarrativeCrossRefs` | 已覆盖 |

**建议本地一键执行（PowerShell）：**

```powershell
cd $env:USERPROFILE\OneDrive\Desktop\VerseCraft
pnpm exec tsx --test src/lib/dmChangeSet/applyChangeSet.test.ts src/lib/domain/clueMerge.test.ts src/lib/domain/narrativeIntegrity.test.ts src/lib/play/narrativeSystems.integration.test.ts src/lib/play/itemGameplay.test.ts src/lib/debug/narrativeSystemsDebugRing.test.ts src/features/play/turnCommit/resolveDmTurn.test.ts src/lib/playRealtime/settlementGuard.test.ts
```

### 2.2 集成测试

- `narrativeSystems.integration.test.ts`：模拟「叙事线索 → 变更集手记 → 获得物 → 手记挂 `relatedItemIds` → 承诺目标带 `required_item_ids` → 完成任务 → 完整性修复」。

### 2.3 回归测试（自动化无法完全替代）

| 领域 | 方式 |
|------|------|
| 聊天/叙事主流程 | 上线前在 staging 跑 2～3 个完整回合（选项 + 手动输入） |
| 存档与继续 | 存档 → 刷新 → 继续；云同步槽位若有则同测 |
| UI 风格 | 目视：任务板、手记、行囊；确认调试面板仅在 env 开启时出现 |
| 主链路性能 | 对比开启/关闭 `NEXT_PUBLIC_VERSECRAFT_SYSTEMS_DEBUG` 的体感；生产勿开 |

---

## 3. 数据迁移与兼容

### 3.1 旧档策略

- **Journal / 手记**：缺字段时由 `normalizeClueDraft` / `normalizeJournalState` 填默认；`mergeCluesWithDedupe` 防炸长度。
- **任务**：`GameTaskV2` 新字段（`requiredItemIds`、`narrativeTrace`、`sourceClueIds`、`promiseBinding`、`goalKind`）均为可选；旧档无则 `undefined`。
- **读档**：`loadGame` / `hydrateFromCloud` 后执行 `repairNarrativeCrossRefs`（见阶段 6 文档）。

### 3.2 新字段默认值

- 手记：`relatedObjectiveId` 可为 `null`；`maturesToObjectiveId` / `trace` 可选。
- 任务：`goalKind` 缺省由 `applyChangeSet` 或适配器推断；`requiredItemIds` 缺省表示无物证硬门槛。

### 3.3 异常修复

- **权威函数**：`repairNarrativeCrossRefs`（`src/lib/domain/narrativeIntegrity.ts`）。
- **无需离线脚本**：当前以读档/云同步时在线修复为主；若需批量审计可调用 `checkNarrativeCrossRefs` 只读报告（可接管理工具）。

### 3.4 回滚方案

- **代码回滚**：revert 阶段 6/7 相关 commit；旧档仍可读（新增字段被忽略）。
- **配置回滚**：关闭 `NEXT_PUBLIC_VERSECRAFT_SYSTEMS_DEBUG`、关闭 `VERSECRAFT_DM_CHANGESET_DEBUG`。
- **Prompt 缓存**：若回滚了 `playerChatSystemPrompt.ts`，记得调整或移除对应的 `VERSECRAFT_DM_STABLE_PROMPT_VERSION` bump。

---

## 4. 可观测性

| 能力 | 方式 |
|------|------|
| 最近一次变更集轨迹 | 响应体 `security_meta.change_set_trace`（由 `applyDmChangeSetToDmRecord` 写入） |
| 客户端面板 | `NEXT_PUBLIC_VERSECRAFT_SYSTEMS_DEBUG=1` → `/play` 右下角「叙事调试」 |
| 过滤/跳过原因 | 面板展示 `extractFilteredHintsFromTrace` 解析结果 |
| 服务端控制台 | `VERSECRAFT_DM_CHANGESET_DEBUG=1` → `[dm_change_set]` 日志 |
| 读档修复 | `NEXT_PUBLIC_VERSECRAFT_NARRATIVE_DEBUG=1` 或 `VERSECRAFT_NARRATIVE_DEBUG=1` → 控制台 repair 摘要 |

---

## 5. 已知风险

1. **`dm_change_set` 与 legacy `clue_updates` 同回合**：当前变更集路径在 `clueBuf.length > 0` 时会设置 `dm.clue_updates`，可能覆盖模型直接输出的 `clue_updates`（以现有 `applyChangeSet` 为准）；若双写同回合需后续合并策略。
2. **关键物自动进手记**：当前主要依赖 DM 在 `clue_updates` 中带 `relatedItemIds`；**未**在客户端对每件新掉落自动生成手记（可后续产品化）。
3. **Resume shadow**：崩溃恢复与正式槽位在手记上可能不一致（见 `phase6-system-linkage.md`）。
4. **生产构建误开 DEBUG**：`NEXT_PUBLIC_*` 会打进包内，仅用于内测/staging。

---

## 6. 后续可优化点

- Playwright / Cypress：单条 E2E「发消息 → 等 JSON → 断言 store 快照」。
- 变更集与 legacy `clue_updates` 的深度合并与冲突指标。
- 关键物获得时可选自动插入「获得物」手记模板。
- Shadow 持久化 `journalClues` 子集。

---

## 7. 上线建议顺序

1. **合并前**：跑上文 `pnpm exec tsx --test …` 全绿；可选 `pnpm run build`。
2. **Staging**：开启 `NEXT_PUBLIC_VERSECRAFT_SYSTEMS_DEBUG=1` 跑通一条委托链；检查面板与 `change_set_trace`。
3. **生产**：关闭所有 `NEXT_PUBLIC_VERSECRAFT_*DEBUG`；按需保留服务端 `VERSECRAFT_DM_CHANGESET_DEBUG=0`。
4. **发布后**：观察错误日志中 `[dm_change_set]`、`[play][consistency]`（叙事获得与结构化不一致告警）。

---

## 8. 验收签字用检查表（简）

- [ ] 单元 + 集成测试命令全绿  
- [ ] 手动：存档 → 刷新 → 手记/任务/背包一致  
- [ ] 生产构建无调试 env  
- [ ] `VERSECRAFT_DM_STABLE_PROMPT_VERSION` 与本次 prompt 变更一致（若改过 stable）  
