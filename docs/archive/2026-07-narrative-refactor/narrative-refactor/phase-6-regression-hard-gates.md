# Phase 6：回归收口 —— 硬门、漂移协议与交接

> **目标**：把前五个阶段的成果焊死：全量回归、文风评测翻 CI 硬门、统一门禁纳入、CLAUDE.md 增补、基线终版与交接报告。本阶段之后，"改崩文风"会在 PR 阶段被机器拦下。
> **前置**：phase-0…5 全部完成。**预计**：1 个会话。

---

## 0. 开始前必读

- `.github/workflows/ci.yml` 全文（重点：`mock-chat-guardrails` 与 `narrative-safety-mock-gate` 两个 job——后者是硬门模板）
- `scripts/test-gate.mjs`（统一门禁运行器，先读懂它的注册方式）
- `docs/narrative-refactor/baselines/` 全部历史基线
- STYLE_BIBLE §12、§13
- 根目录 `CLAUDE.md`（要增补的目标文件）

---

## 1. 执行步骤

### 6.1 全量回归

依次跑并记录（任何红项先修再继续）：

1. `pnpm test:ci`（lint + 单测 + db 软检 + build）
2. `pnpm exec tsc --noEmit`
3. `pnpm test:e2e:contract`
4. mock 服务起后：`benchmark:chat:mock`、`eval:chat-quality:mock`、`eval:narrative-safety:mock`、`eval:npc-consistency:mock`、`eval:narrative-style:mock`
5. `pnpm test:promptfoo`、`pnpm test:playthrough`
6. `pnpm test:gate`（若其范围与上面重叠，跑一次确认不冲突即可）

### 6.2 CI 硬门【合入待人工确认】

1. 去掉 phase-0 在 `mock-chat-guardrails` 中给 `eval:narrative-style:mock` 加的 `|| true`。
2. 仿照 `narrative-safety-mock-gate` 新增 job `narrative-style-mock-gate`：`needs: mock-chat-guardrails`、`if: always()`、下载 artifact、内联 node 脚本断言 `.runtime-data/eval-narrative-style-mock.json` 的 `gatePass === true`（含 must_fail 反向保护全部命中）。
3. styleValidator 中 phase-0 定为低档的 `choice_preview_tail` 等 hard 类判据，severity 按 STYLE_BIBLE §12 升级（升级只影响评测 gate 与遥测，不接任何线上拦截/改写——线上纠偏仍只有 phase-2 已建的钩子改写一条）。
4. `VERSECRAFT_ENABLE_NARRATIVE_DIRECTIVE` 默认值翻转为开：先在开/关两态各跑一遍 `benchmark:chat:mock` 与 `test:e2e:mock` 留证据，然后翻默认、更新 `.env.example` 与文档。**此项与硬门合入一起，停下来等用户确认。**

### 6.3 test:gate 纳入

按 `test-gate.mjs` 的既有注册方式把 `eval:narrative-style:mock` 加入门禁序列（`--quick` 档是否包含由脚本现有分层逻辑决定，离线纯函数评测很快，建议进 quick）。

### 6.4 CLAUDE.md 增补（最小 diff）

1. §3.3 常用命令表追加 `pnpm eval:narrative-style:mock  # 文风评测（golden + must_fail 反向保护）`。
2. §7.3 追加一段：涉及叙事文风、prompt 语气、styleBible/styleValidator、开场与 NPC 声音的改动，必须先读 `docs/narrative-refactor/STYLE_BIBLE.md`，改后必须跑 `eval:narrative-style:mock` 并与 `docs/narrative-refactor/baselines/` 对比。
3. §10 高风险文件清单追加：`src/lib/narrativeStyle/styleBible.ts`、`src/lib/narrativeStyle/styleValidator.ts`、`src/lib/playRealtime/narrativeDirectivePackets.ts`。
4. §11 增加一个小节"文风 / 节奏 / 伏笔"：先读文件清单（STYLE_BIBLE、styleValidator、narrativeDirectivePackets、pacing ledger 相关）+ 验证命令。

### 6.5 基线终版与归档

1. 跑一次完整评测记 `baselines/<日期>-final.md`：与 phase-0 初始基线做总对照表（每项遥测/分数：初始 → 终版）。
2. 核对 STYLE_BIBLE §12 表中每行的阈值与代码实际值一致（不一致改表并注明）。
3. `drafts/` 归档整理；PROGRESS 所有勾选完成、状态表全"完成"。

### 6.6 交接报告

新建 `docs/narrative-refactor/HANDOFF.md`：

1. **改动全景**：每阶段一段（做了什么、关键文件、关键提交）。
2. **新增能力清单**：评测命令、开关（名称/默认值/作用）、两张表、新契约字段、CI 门。
3. **运维注意**：部署需设置的 `VERSECRAFT_DM_STABLE_PROMPT_VERSION` 终值；db push 状态；live judge 所需环境；CI 硬门位置。
4. **漂移协议**（长期防崩条款，同时确保已进 CLAUDE.md 指针）：今后任何触碰文风源/prompt/styleBible 的改动 = ① 对照 STYLE_BIBLE → ② 改后跑 `eval:narrative-style:mock` + 相关 eval → ③ 与 baselines 对比，回退超过 5% 必须解释或回滚 → ④ 语义边界变化则 bump prompt version → ⑤ 故意的风格演进需修订 STYLE_BIBLE 版本号并更新 golden 语料。
5. **未尽事项与建议**：live judge 定期跑的建议频率；人工试玩清单；后续可选优化（如 imagery_bank 扩池、伏笔过期率调参、动态章节 endHook 强化）。

---

## 2. 硬性禁止

- 不在本阶段夹带任何新功能或文案改动（发现问题 → 修复性最小 diff，或记入 HANDOFF 未尽事项）。
- 硬门与开关默认值翻转必须经用户确认后合入。
- 不放松任何既有评测阈值来让全量回归变绿。

## 3. 验收清单

- ✅ 6.1 全部命令绿（记录在 PROGRESS 基线表）
- ✅ CI 两处改动（去 `|| true` + 新硬门 job）已提交并经用户确认
- ✅ `pnpm test:gate` 含新评测且通过
- ✅ CLAUDE.md 增补完成且 `npx eslint .` / `pnpm test:ci` 复跑通过
- ✅ `baselines/<日期>-final.md` + `HANDOFF.md` 完成；PROGRESS 全部勾选，NEXT 改为"已完成"

## 4. 汇报

按 CLAUDE.md §15，并附 HANDOFF.md 的路径与初始→终版核心指标对照表（文风遥测、评测分、延迟三档 p95）。
