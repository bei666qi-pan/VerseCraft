# Narrative Refactor 交接报告

> 日期：2026-07-09
> 执行者：Claude Code（无人值守 overnight run）
> 范围：phase-0 → phase-6 全部完成

---

## 一、总览

本 refactor 分 7 个阶段，从评测先行到回归收口，历时 2 天（2026-07-08 ~ 2026-07-09）。核心目标是将 VerseCraft 的叙事系统从"能跑"升级为"有质量保证的可调控系统"。

| 阶段 | 目标 | 关键交付 |
|---|---|---|
| phase-0 | 评测先行 | styleValidator 遥测扩展、registerClassifier、eval 脚本、CI 接线、基线 |
| phase-1 | 文风源重写 | styleBible v3、prompt 文风段重写、styleExamples few-shot、mock 场景对齐 |
| phase-2 | 节奏导演 | pacingLedger、directivePackets、styleValidator register_repetition、route.ts 接线 |
| phase-3 | 开场重写 | v3 开场 1435 字、OPENING_SYSTEM_PROMPT 四方向、前五回合 beat、任务链文案 |
| phase-4 | NPC 声音 | voiceCard×6、群像补声、persona packet 注入、幽默位、对白配额指令 |
| phase-5 | 伏笔兑现 | foreshadowOps 全链路、lifecycle 状态机、ledger 模块、taskToast 升级、settlement 高光 |
| phase-6 | 回归收口 | test:gate 纳入新评测、CLAUDE.md 增补、基线终版、交接报告 |

---

## 二、最终验证结果

| 命令 | 结果 |
|---|---|
| `pnpm test:unit` | ✅ 2551/2551 pass（0 fail） |
| `npx eslint .` | ✅ 0 errors |
| `pnpm exec tsc --noEmit` | ⚠️ 25 errors（全在 drizzle/schema.ts，generated file，pre-existing） |
| `pnpm eval:narrative-style:mock` | ✅ 91/91 gate=pass（44 golden + 47 must_fail） |
| `pnpm eval:narrative-safety:mock` | ⚠️ gate=fail（json/sse=0 是 mock-mode 已知问题，其余维度 1.0） |

---

## 三、文件变更统计

### 新增文件（~15 个）

| 文件 | 说明 |
|---|---|
| `src/lib/narrativeGovernance/foreshadowLifecycle.ts` | 伏笔生命周期纯函数状态机 |
| `src/lib/narrativeGovernance/foreshadowLifecycle.test.ts` | 15 个纯函数测试 |
| `src/lib/narrativeGovernance/foreshadowLedger.ts` | 伏笔账本 DB 写入/读取/过期 |
| `src/lib/narrativeGovernance/foreshadowLedger.test.ts` | 6 个参数+fail-open 测试 |
| `src/lib/turnEngine/pacing/pacingLedger.ts` | 节奏账本写入 |
| `src/lib/turnEngine/pacing/pacingLedger.test.ts` | 节奏账本测试 |
| `src/lib/playRealtime/narrativeDirectivePackets.ts` | 节奏指令 packet |
| `src/lib/playRealtime/narrativeDirectivePackets.test.ts` | 指令 packet 测试 |
| `docs/narrative-refactor/STYLE_BIBLE.md` | 文风圣经 |
| `docs/narrative-refactor/baselines/2026-07-09-phase-5.md` | phase-5 基线 |
| `docs/narrative-refactor/baselines/2026-07-09-phase-4.md` | phase-4 基线 |

### 修改文件（~20 个核心变更）

| 文件 | 变更摘要 |
|---|---|
| `src/lib/playRealtime/playerChatSystemPrompt.ts` | 文风段重写 + prompt version bump + 任务三要素约束 |
| `src/lib/playRealtime/normalizePlayerDmJson.ts` | foreshadow_ops normalize |
| `src/features/play/turnCommit/resolveDmTurn.ts` | foreshadow_ops 透传 + taskToast §5 语气 |
| `src/features/play/turnCommit/turnEnvelope.ts` | foreshadow_ops 可选字段 |
| `src/lib/turnEngine/commitTurn.ts` | COMMIT_STATE_CHANGING_FIELDS 追加 |
| `src/app/api/chat/route.ts` | directive 注入 + ledger 写入 + 过期扫描 |
| `src/lib/registry/world.ts` | NPC speech_patterns + emotional_traits |
| `src/lib/playRealtime/multiNpcPersonaPackets.ts` | voice_hint 注入 persona packet |
| `src/app/settlement/page.tsx` | 高光分节 + writingMarkdown 导出 |
| `src/lib/endings/types.ts` | highlights 可选字段 |
| `scripts/test-gate.mjs` | L5 纳入 narrative-safety eval |
| `CLAUDE.md` | foreshadow_ops + Turn Engine 更新 |

---

## 四、灰度开关

| 开关 | 当前值 | 建议 |
|---|---|---|
| `VERSECRAFT_ENABLE_NARRATIVE_DIRECTIVE` | `"1"` ✅ 已开启 | 线上验证 directive 行为后确认 |
| `VERSECRAFT_DM_STABLE_PROMPT_VERSION` | `"v5-20260709"` ✅ 已 bump | prompt 三要素约束生效（KV 缓存已失效） |

---

## 五、DB 依赖

以下功能需 `db:push` 后才真正生效（当前 fail-open 降级为空）：

1. **narrative_pacing_ledger**：回合情绪档位写入（phase-2 已建表）
2. **narrative_foreshadow_ledger**：伏笔账本写入/读取/过期（phase-5 已建表）
3. **settlement highlights**：高光时刻需从 pacing_ledger 查询 is_payoff/hookType

---

## 六、已知遗留

| 项目 | 状态 | 影响 |
|---|---|---|
| drizzle/schema.ts 25 个 type errors | pre-existing | 不影响运行（next.config.ts ignoreBuildErrors） |
| narrative-safety eval json/sse=0 | pre-existing mock-mode | 不影响线上（mock 不返回完整 SSE） |
| 章节 endHook 动态生成 | 文档约定，未代码接入 | 由 world engine 驱动，无独立"章节生成 prompt" |
| benchmark:chat:mock | 需服务器环境 | 本地无法运行 |

---

## 七、重玩价值检查清单

交付后建议人工验证：

1. 开场四方向差异化（不同选项 → 不同叙事起点）
2. NPC 对白声音差异（老刘冷幽默 vs 欣蓝碎碎念 vs 红姨广播腔）
3. 伏笔播种→到期提醒→兑现/过期 全生命周期
4. 任务完成 toast 语气（"——收。"/"——落空了。"）
5. 结算页"本局高光时刻"分节（如有数据）
6. 任务文案三要素（title=具体动作 / desc=代价入手 / nextHint=可执行第一步）
