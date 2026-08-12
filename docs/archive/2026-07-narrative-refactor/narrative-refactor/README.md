# VerseCraft 叙事体验重构 · 执行包（narrative-refactor v1）

> 本目录是一次**长程叙事重构**的完整执行方案，执行者是 Claude Code。
> 裁决顺序：仓库当前代码与测试 > 根目录 CLAUDE.md > 本目录文件。发现冲突时以代码为准，并把差异记入 PROGRESS.md 的 Deviations 表，不要沉默地按过期描述改代码。

---

## 1. 这次重构要解决什么

现状诊断（2026-07 仓库勘察，真实样本与逐条分析见 STYLE_BIBLE.md §10）：

- **文风单一压抑**：意象循环（走廊/灯管/刮擦/潮湿纸页反复出现），明喻堆叠成瘾（"像…像…又像…"三连），正文几乎零对白，情绪只有"紧张压迫"一个档位。
- **结尾公式化**：大量回合以"我能继续A，也能先B，或者C"的选项预告收尾。UI 已单独渲染 4 条选项，这种尾巴既冗余又出戏，且钩子无类型、无轮换。
- **人物没有温度**：45 个 NPC 有设定无声音，六辅锚（麟泽/灵伤/欣蓝/北夏/枫/叶）的魅力没有进入正文，玩家记不住任何人。
- **无爽点系统**：伏笔没有账本、兑现无调度，玩家长期得不到情绪回报；死亡与结算缺乏"意难平+再来一局"的动机设计。
- **文风判据分散且无护栏**：文风定义散落 4 处（见 §5），任何一处改动没有评测兜底，一改就崩。

**目标**：把阅读体感从"单一恐怖压抑"重构为**广受众的青春悬疑冒险**——十日终焉式的钩子密度与目标感 + 龙族式的人物温度与幽默自嘲；同时建立**叙事质量评测护栏**，让以后任何改动都不会悄悄把文风改崩。

**明确不改**：职业、武器、战斗数值、地图与楼层机制、核心路由（`/` `/intro` `/create` `/play` `/settlement`）、SSE 帧语义、DM JSON 既有字段契约。任务的**文案与戏剧结构**可以改（对外契约字段保持兼容）。诡异世界观保留——"诡异是世界的事实，压抑不是阅读的体感"。

---

## 2. 文件索引

| 文件 | 作用 |
|---|---|
| `README.md` | 本文件：总纲、启动方式、全局红线、会话协议 |
| `STYLE_BIBLE.md` | 叙事风格宪法 v3：所有文风改动的唯一依据，含正反例与评测判据映射 |
| `PROGRESS.md` | 进度账本：阶段状态、步骤勾选、基线记录、Deviations、NEXT 指针 |
| `phase-0-metrics-baseline.md` | 评测先行：建立文风评测与基线（不改任何叙事行为） |
| `phase-1-style-source-rewrite.md` | 风格宪法落地到全部文风源 |
| `phase-2-pacing-director.md` | 节奏导演闭环：情绪档位轮换、钩子强制、节奏账本 |
| `phase-3-opening-early-game.md` | 开场与前五回合（留存最关键的文本面） |
| `phase-4-npc-charm-dialogue.md` | NPC 声音卡与对白引擎 |
| `phase-5-foreshadow-payoff-tasks.md` | 伏笔-兑现系统、任务戏剧化、结算高光 |
| `phase-6-regression-hard-gates.md` | 回归收口：CI 硬门、漂移协议、交接 |
| `baselines/` | 各阶段评测基线快照（入库保存，`.runtime-data/` 不入库） |
| `drafts/` | 落选文案候选归档（执行中按需创建） |

---

## 3. 阶段依赖与预计规模

顺序执行：**0 → 1 → 2 → 3 → 4 → 5 → 6**。0 是 1 的前提（先立尺再动刀）；2 依赖 1 的风格判据；3/4/5 依赖 2 的节奏底座；6 收口。

| 阶段 | 一句话 | 预计会话数 |
|---|---|---:|
| 0 | 不改行为，建立文风评测与基线 | 1-2 |
| 1 | 重写全部文风源并通过评测 | 2-3 |
| 2 | 节奏导演从 observer 变成真正驱动 | 2-3 |
| 3 | 开场与前五回合重写 | 1-2 |
| 4 | NPC 声音卡与对白 | 1-2 |
| 5 | 伏笔账本与爽点兑现 | 2 |
| 6 | 回归、硬门、交接 | 1 |

---

## 4. 每次会话怎么启动（人类操作手册）

每次给 Claude Code 粘贴以下启动提示词即可，不需要额外解释上下文：

```text
你在 VerseCraft 仓库中执行一次长程叙事重构。规则：

1. 先完整阅读 docs/narrative-refactor/README.md 和 docs/narrative-refactor/PROGRESS.md。
2. 找到 PROGRESS.md 中「NEXT」指向的阶段与步骤，完整阅读对应的 docs/narrative-refactor/phase-*.md，以及 STYLE_BIBLE.md 中被该 phase 引用的章节。
3. 严格按 phase 文件的步骤顺序执行，一次会话只推进当前阶段，做完一步、验证一步、提交一步。
4. 遵守 README §6 全局红线与根目录 CLAUDE.md；两者与代码事实冲突时以代码为准，并把差异记入 PROGRESS.md 的 Deviations 表。
5. 会话结束前：更新 PROGRESS.md（勾选完成步骤、更新 NEXT 指针、在基线表登记本次跑过的验证命令与结果），按 README §9 提交，并按 CLAUDE.md §15 的格式汇报。
6. 不执行 pnpm db:push、pnpm run ship、任何部署操作；migration 只生成不推送，等待人工确认。
```

**需要人工介入的固定确认点**（Claude Code 会停下来等你）：

1. 任何 `pnpm db:push`（phase-2 建表后）。
2. 部署环境更新 `VERSECRAFT_DM_STABLE_PROMPT_VERSION`（phase-1 改 prompt 后，Coolify 环境变量要同步 bump，否则 KV 缓存里的旧 prompt 前缀不会失效）。
3. phase-6 把新评测翻成 CI 硬门的合入决定。
4. live 评测（`eval:narrative-style` 的 live 模式）需要真实网关密钥环境，由你选择何时跑。

**建议人工试玩点**：phase-1 和 phase-3 完成后，各用真实网关跑 10 回合读一读。文风最终要人读着舒服，评测只是护栏。

---

## 5. 全局事实速查（执行前自行复核，勿凭记忆）

**文风四源**（改文风必须四处对齐，缺一处就会互相打架）：

1. `src/lib/playRealtime/playerChatSystemPrompt.ts` — stable prompt 的【最高优先级·平台身份】与【叙事风格】段 + `buildCompactStablePlayerDmSystemLines()` 里的压缩版文风句 + `buildStyleGuidePacketBlock()`（受 `VERSECRAFT_ENABLE_STYLE_GUIDE_PACKET` 灰度）。改后必须 bump `VERSECRAFT_DM_STABLE_PROMPT_VERSION` 并跑 `pnpm prompts:regen:verify`。
2. `src/lib/narrativeStyle/styleBible.ts` — 结构化 profile（当前 id `youth_campus_suspense_v2`），是 styleValidator 的判据源。
3. `src/lib/narrativeStyle/styleExamples.ts` — few-shot 正例。
4. 测试/评测里的风格锚：`src/lib/ai/mock/mockScenarios.ts`（mock 三段叙事+四选项）、`e2e/fixtures/endingMocks.ts`、`benchmarks/llm-evals/cases.json`、`promptfooconfig.yaml`、`src/lib/playRealtime/playerChatSystemPrompt.test.ts`。**改风格不同步改锚 = 测试挂**。

**评测家族**（全部已在 CI 的 `mock-chat-guardrails` job 跑）：`eval:chat-quality:mock`、`eval:narrative-safety:mock`（另有硬门 job `narrative-safety-mock-gate`）、`eval:npc-consistency:mock`；蓝本代码在 `scripts/eval-*.ts` + `src/lib/evals/*Rubric.ts` + `benchmarks/*/cases.json`。mock 由 `AI_PROVIDER=mock` + 消息前缀 `[mock_scenario:xxx]` 驱动（`src/lib/ai/mock/mockScenarios.ts`）。LLM judge 基建在 `src/lib/evals/judge/judgeExecutor.ts`（多裁判取中位数）。

**节奏底座**（已存在，重构是"接线激活"不是从零造）：

- `src/lib/worldEngine/directorState.ts` — 张力状态机（tension/mystery/fatigue/progress/agency_health/reveal_pressure ∈ [0,1] + phase：quiet/build_up/pressure/reveal/recovery），落库 `world_engine_director_state`。
- `src/lib/turnEngine/pacing/validatePacing.ts` — BeatState（setup/rising/choice/peak/aftermath/cooldown）与揭示预算校验。
- `src/lib/worldEngine/agenda.ts` — `loadDueDirectorAgenda()` 短超时 fail-open 注入在线回合。
- `src/lib/narrativeStyle/styleValidator.ts` — 已有 hook_missing、sentence_rhythm_flat、purple_prose_overload、sensory_density_low、info_density_low 等检测与遥测。

**改写/降级通道**（新叙事开销优先塞进这些既有通道）：`repairNarrativeOnly()` / `expandNarrativeOnly()` / `generateOptionsOnlyFallback()`（`src/lib/ai/logicalTasks.ts`）、`applyNarrativeOverride`（`src/lib/turnEngine/commitTurn.ts`）、`runStreamFinalHooks` 内联相位链（`src/app/api/chat/route.ts`）。

---

## 6. 全局红线（每个会话、每个阶段都适用）

**契约红线**

- SSE 帧语义不动：`__VERSECRAFT_STATUS__:` 控制帧、`__VERSECRAFT_FINAL__:` 终帧覆盖语义、降级时仍 `200 + SSE`。
- DM JSON 必填四字段（`is_action_legal` / `sanity_damage` / `narrative` / `is_death`）与既有兼容字段只增不改不删；新增字段必须可选、缺省安全，并走 CLAUDE.md §5.2 的全链路检查清单。
- system prompt 中要求 JSON 输出的字面量「请严格以 JSON 格式输出」必须保留。
- 叙事 POV 是第一人称"我"的硬约束，不许改成第二人称。
- options 恰好 4 条、单条 ≤40 字的契约不动。
- `PLAYER_CHAT` 永不路由到 `reasoner`/`enhance`；`reasoning_content` 永不回传。

**延迟红线**（用户裁定：严守；"不计成本"指的是重构过程可以反复迭代评测，不是给在线链路加延迟）

- 首字前路径（安全 lane → preflight → prompt 组装 → 主模型首 token）**禁止新增任何模型调用**；新增的 packet 必须是确定性计算。
- 新增的 DB 读取必须仿照现有模式：短超时 fail-open（参考 route.ts 的 `TTFT_HARD_CAP_SESSION_MEMORY_MS = 140` 与 `loadDueDirectorAgenda` 的做法），写入必须非阻塞 fire-and-forget（参考 analytics 写入）。
- 生成后改写只允许在 final hooks lane 内、复用既有短超时任务（如 NARRATIVE_EXPANSION，7s 超时），且只在校验失败时触发；预算不足时降级放行 + 遥测，不无限重试。
- 每个阶段收尾必须跑 `pnpm benchmark:chat:mock` 且通过；这是延迟不回归的机器证据。

**流程红线**

- 不执行 `pnpm db:push` / `pnpm run ship` / 部署 / `rm -rf` / `git reset --hard`；migration 用 `pnpm db:generate` 生成后停下等人工确认。
- 不改 `.env.local`，不输出密钥。需要新环境变量时：更新 `.env.example` + 文档，默认值必须让本地与 CI 在不配置时行为不变。
- 不引入新依赖、不切包管理器、不新增 `tailwind.config.*`。
- 每步小提交（见 §9），永不把多个步骤混进一个巨型 diff。

**内容红线**

- 参考龙族/十日终焉只许**提炼技法**（见 STYLE_BIBLE §9），禁止出现其作品名、作者名、人物名、专有名词、可识别桥段与任何原文；已有 prompt 规则"不引用现实作品篇名、作者或名台词"继续保留。
- 世界观事实以 `src/lib/registry/` 与 `docs/world-bible.md` 为准，文案重写不得篡改 canon 事实、不得泄漏 DM-only 真相（epistemic 边界照旧）。
- 所有玩家可见文本简体中文。

---

## 7. "不计成本"的正确姿势

重构预算花在**迭代与验证**上，具体要求：

1. **评测循环**：每个涉及文风的步骤，实现后必须跑相关 eval → 按失败项修 → 再跑，**最少完整两轮**，直到达到该 phase 的验收阈值；把每轮分数记入 PROGRESS.md 基线表。
2. **多候选写作**：关键文案（开场正文、stable prompt 文风段、六辅锚 voice card、结算文案）先写 2-3 个候选，用 STYLE_BIBLE §12 的判据自评择优，落选稿存 `docs/narrative-refactor/drafts/` 并注明落选原因。
3. **自审 diff**：每步提交前重读自己的 diff，检查：是否越界改了无关文件、是否留下 TODO/半成品、是否破坏 §6 红线。
4. **子代理审查**：phase 收尾时，可再开一个只读子任务从头 review 本阶段全部 diff（以"新读者"视角挑毛病），发现的问题当场修。
5. 允许为了质量多读文件、多跑测试、多写测试用例；不允许为了省事跳过验证或缩小改动面到"糊弄能过"。

---

## 8. 会话收尾协议

每次会话结束前，依次完成：

1. `PROGRESS.md`：勾选本次完成的步骤；更新「NEXT」指针到下一个未完成步骤；在基线表追加本次跑过的验证命令与关键数字；如有代码事实与计划不符，追加 Deviations 行。
2. 确认工作区干净：无未提交改动、无被污染的无关文件。
3. 按 CLAUDE.md §15 格式汇报：改动 / 文件 / 验证（✅ 实际执行过的命令；⚠️ 未运行及原因）/ 风险与后续。
4. 如果本步骤改了 `playerChatSystemPrompt.ts`，汇报里必须显式提醒：部署时需 bump `VERSECRAFT_DM_STABLE_PROMPT_VERSION`。

---

## 9. 提交规范

- 每完成一个编号步骤提交一次，message 格式：`narrative-refactor(phase-N): 步骤号 一句话`，例如 `narrative-refactor(phase-1): 1.3 重写 stable prompt 文风段并 bump 版本`。
- 只提交，不推送发布；`pnpm run ship` 只有用户明确要求时才允许。
- migration 文件可以提交，但对应的 `db:push` 必须等人工确认（在 PROGRESS.md 标注"待 push"）。
