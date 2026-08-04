# VerseCraft 2026-07 全面升级改造总结报告

> 依据：`docs/improvement-research-2026-07.md`（深度调研报告）+ 用户指令"先不动合规风险这一条，依照以上方案和搜查信息，按照你的理解进行全面升级改造"。
> 范围边界：**明确排除 3.0 合规自查 与 G6（依赖合规结论的玩家内容沉淀）**，其余 T1–T9、G1–G5 按优先级逐项推进。
> 执行方式：每项改动都遵循"先读代码→最小 diff→跑最窄相关验证"，不做无关重构，不批量格式化。

---

## 一、总体验证结果（覆盖全部改动的最终统一检查）

- ✅ `tsc --noEmit`（全量项目）：本次改动涉及的全部文件（20 个已修改 + 15 个新增，见下）**零新增类型错误**。项目本身存在约 60+ 处与本次改动无关的历史遗留类型错误（`next.config.ts` 的 `typescript.ignoreBuildErrors: true` 正是为此设置），已逐一核对确认均不在本次改动文件列表中。
- ✅ `eslint`（本次改动的全部源文件 + 测试文件，一次性检查）：**0 errors，9 warnings**，且全部 9 条 warning 均为改动前已存在（5 条 `page.tsx` 里的 `react-hooks/exhaustive-deps`，4 条 `useGameStore.ts` 里的未使用变量），本次未新增任何 warning。
- ✅ 本次新增/修改的全部测试文件，一次性合并运行：**203 个测试用例，100% 通过**（0 fail）。涵盖：新增纯函数单测、既有回归测试（golden scenes、school cycle、memorySpine、codex 显示、storyDirector 等）。
- ✅ `.github/workflows/ci.yml` YAML 语法校验通过。
- ⚠️ 未运行：`pnpm test:e2e:chat` / `pnpm test:e2e:contract`（Playwright e2e，需要真实/mock server，当前沙箱无法启动完整 Next.js 服务）；`docker build`（沙箱无 Docker）；任何数据库连接类验证（沙箱无 Postgres/Redis 实例，`REDIS_URL` 未配置）。这几类均已在下文各项的"验证"小节里逐一标注，并说明用间接证据替代验证的理由。

---

## 二、按项目改动清单

### T1：修复关系数值写入不一致

**改动**：`useGameStore.ts` 的 `mergeCodex` 对 `favorability/trust/fear/debt` 四个字段，从"覆盖写"改为"累加 + `clampRelation` 裁剪到 [-100,100]"，与任务结算路径（`applyTaskRelationshipConsequencesToCodex`）的既有语义保持一致，同时防止 AI 单次异常输出把数值写出合法范围。

**文件**：`src/store/useGameStore.ts`

**验证**：✅ `src/store/useGameStore.phase4Commit.test.ts` 新增"mergeCodex 累加裁剪"用例，通过。

---

### T2：结构化输出可靠性升级

**改动**：新增可选的 OpenAI Structured Outputs（JSON Schema，`strict:false`）支持，默认关闭（`AI_GATEWAY_JSON_SCHEMA_ENABLED=false`），不改变现有行为；开启后 PLAYER_CHAT 请求会带 `response_format: json_schema`。

**文件**：
- `src/lib/ai/schemas/playerDmJsonSchema.ts`（新增）：手工镜像 `DMJson` 类型为 JSON Schema，`strict:false`（原因见文件头注释：strict 模式要求穷举字段，风险是意外挡掉未声明字段）。
- `src/lib/ai/providers/types.ts`：`NormalizedCompletionRequest` 新增 `responseFormatJsonSchema` 可选字段。
- `src/lib/ai/gateway/openaiCompatible.ts`：payload 组装优先读取该字段。
- `src/lib/ai/config/envCore.ts`：新增开关 `aiGatewayJsonSchemaEnabled`。
- `src/lib/ai/router/execute.ts`：PLAYER_CHAT 流式请求按开关+fast-lane 条件决定是否附加 schema。

**验证**：✅ `src/lib/ai/gateway/openaiCompatible.jsonSchema.test.ts`（4 个用例：序列化正确性、优先级顺序、默认行为不变、字段覆盖完整性）全部通过。⚠️ 未验证：真实网关是否接受该 `response_format` 语法（默认关闭，需要用户在有网关凭证的环境里实测再决定是否开启）。

---

### T3：补齐 EpistemicFilter phase-3 回接缺口

**改动**：原调研报告曾认为"EpistemicFilter 没有回接进 prompt 组装"是待办缺口。**直接查代码证明这个说法已过期**——回接早已存在且有测试覆盖。本项工作是**更正文档**而非写代码。

**文件**：`docs/turn-engine-architecture.md`（第 7 节、第 10 节路线图两处过期表述加删除线+"2026-07 更新"批注，引用 `route.ts` 实际行号与 `promptContext.test.ts`），并将路线图里对应条目替换为新的真实待办（审计 `runtimePackets`）。

**验证**：✅ 直接阅读 `route.ts` + 运行 `promptContext.test.ts` 确认现状。

---

### T5：eval 脚本诚实化与 CI 接线

**改动**：`mock-chat-guardrails` CI job 补跑 `pnpm run eval:npc-consistency:mock`，产物加入 artifact 上传列表。

**文件**：`.github/workflows/ci.yml`

**验证**：⚠️ 未在沙箱里跑通完整 CI（无法起 mock server），已核对该脚本本身不需要 `BENCHMARK_BASE_URL` 前缀（与已有的其他 mock eval 脚本用法一致）。

---

### T9：CI 补 docker build 与生产验证闸门

**改动**：新增独立 CI job `docker-build`，`docker build -t versecraft:ci-verify .`（不 push）。

**文件**：`.github/workflows/ci.yml`

**验证**：⚠️ 沙箱无 Docker，无法本地跑 `docker build`。间接证据：`Dockerfile` 内核心步骤 `pnpm run build` 已在既有 `verify` CI job 里稳定通过；本次仅新增一个校验 job，未改动 `Dockerfile` 本身。

---

### G3：任务系统服务端自动失败判定

**改动**：`GameTaskV2` 新增 `autoFailAfterGameHour`（游戏内小时数，与既有 `promiseBinding.boundAtGameHour` 同口径，刻意避开 `expiresAt`/`parseHoursIso` 的 epoch-vs-game-hour 单位不一致陷阱——该陷阱是本次调研中发现但**刻意未修**的一个真实预置 bug，见下文"风险"）。新增纯函数 `computeAutoFailedTaskIds` / `applyAutoFailedTasks`，接入 `applyGameTimeFromResolvedTurn`：每次整点推进后自动把超时 active 任务转 failed，不再单纯依赖 AI 单次声明。

**文件**：`src/lib/tasks/taskV2.ts`、`src/store/useGameStore.ts`

**验证**：✅ `src/lib/tasks/taskV2.test.ts`、`src/store/useGameStore.phase4Commit.test.ts` 新增用例全部通过。

---

### G1 + G4：理智值状态效应系统

**改动**：理智值从纯数值升级为"状态效应"系统，两处联动：
1. **G1（与 reveal 分级门禁联动）**：新增 `sanityRatio`（当前理智/历史理智峰值，裁剪 [0,1]）与四档 `sanityBand`（stable/strained/fractured/critical，档位阈值 0.7/0.4/0.2）。`fractured` 及以上抬到 `fracture` reveal 层，`critical` 抬到 `deep` reveal 层——呼应 Bloodborne"洞察"双刃剑设计：心智越接近崩溃，越能触及被隐藏的真相。
2. **G4（叙事不可靠性提示）**：非 stable 档位生成一句"仅影响叙事风格、不是新增事实"的提示，拼进 prompt，供主模型在叙事措辞层面表现感官/记忆的轻度不可靠，但明令禁止据此新增或篡改任何结构化字段。

用比值而非绝对值分档的原因：角色创建时理智初始点数因加点而异，绝对阈值在不同 build 间体验不一致；比值同时呼应"生命汇源"天赋已确立的"历史峰值即人格完整度上限"设定。

**文件**：
- `src/lib/registry/sanityStateRegistry.ts`（新增）：档位计算 + 叙事提示文案，纯函数。
- `src/lib/registry/playerWorldSignals.ts`：新增 `理智状态[current/hist]` 正则解析，产出 `sanityRatio`/`sanityBand`。
- `src/lib/registry/revealRegistry.ts`：`REVEAL_GATE_RULES` 追加两条规则（`sanity_fractured`/`sanity_critical`），只追加不改动既有规则。
- `src/store/useGameStore.ts`：`getPromptContext()` 注入新 bracket 与叙事提示 block；NPC heart 视图的本地 reveal 计算同步补上同一信号，避免两处 reveal 逻辑不一致。

**验证**：✅ 新增 `sanityStateRegistry.test.ts`（15 例）+ `sanityRevealIntegration.test.ts`（7 例，含"无信号时不误触发"回归用例）全部通过；重跑 6 个既有 reveal/school-cycle 相关测试文件（50 例）确认零回归。

---

### G2：NPC 关系记忆叙事化呈现

**改动**：图鉴"关系印象"此前只有 4 档固定模板文案（盟友/恋人/敌人/暂无），完全脱离具体发生过什么。本次新增"记忆片段"区块，从既有 `memorySpine`（此前只喂 AI prompt，从未面向玩家）里挑选与该 NPC 相关的 1-3 条具体记忆，叙事化展示给玩家（星野"记忆相片"式具象记忆，而非数值条）。

顺带修复一个数据质量问题：`memorySpine` 里 `relationship_shift` 记忆的自动摘要此前是`"你与N-010的关系发生变化（trust+2）"`这种带内部 id、原始数值的机器味文本，本次改为解析度最高的字段生成一句定性描述（如"看起来更信任你了"）并换用图鉴展示名，因为这份摘要现在要同时给玩家看。

**文件**：
- `src/lib/registry/relationshipMemoryDisplay.ts`（新增）：选取 + 清洗 + 格式化，含防御性正则拒绝任何"看起来像未清洗内部标识"的文本（呼应 `codexDisplay.ts` 已有的 `isLikelyRegistryIdName` 同类防御思路）。
- `src/lib/memorySpine/extract.ts`：`relationship_shift` 摘要生成改用展示名 + 定性描述短句。
- `src/features/play/mobileReading/codexFormat.ts` / `types.ts`、`src/features/play/mobileReading/components/MobileCodexPanel.tsx`：新增"记忆片段"UI 区块。
- `src/app/play/page.tsx`：新增 `memorySpine` store 订阅，透传给 `MobileCodexPanel`（2 处调用点）。

**验证**：✅ 新增 `relationshipMemoryDisplay.test.ts`（9 例）+ `extract.test.ts`（5 例）全部通过；重跑 `memorySpine.test.ts`、`codexFormat.test.ts`、`codexDisplay.test.ts`、storyDirector/narrativeEngine 相关测试确认零回归。⚠️ 未运行 Playwright，UI 呈现效果建议人工在浏览器里过一遍图鉴面板。

---

### T6：高风险文件测试覆盖

**改动**：`route.ts`/`play/page.tsx`/`HydrationProvider.tsx` 是 CLAUDE.md 列出的高风险文件，此前均无直接单测。逐一评估后：
- **`play/page.tsx`**：挑出 5 个此前零覆盖、逻辑较复杂的纯函数（结局遥测阻断诊断 `buildNoEndingTelemetryBlockers`/`computeTelemetrySurvivalHours`；模型限流可恢复性判定 `isRecoverableModelRateLimit`/`isLocalRateLimitedPayload`/`dmIndicatesRecoverableModelRateLimit`），按本仓库已有的 `src/lib/play/*` 抽取约定，原样搬到两个新文件、以相同函数名重新 import 回 `page.tsx`（8 个内部调用点零改动），补齐单测。
- **`route.ts`**：评估后**未动**。原因见下文"风险"。
- **`HydrationProvider.tsx`**：评估后**未动**，已有 `e2e/idb-hydration.spec.ts` 做脏数据注入式端到端验证，其核心逻辑嵌在 hook/effect 里不易剥离成纯函数，强行剥离的重构风险大于收益。

**文件**：`src/lib/play/noEndingTelemetryBlockers.ts`（新增）、`src/lib/play/chatRateLimitRecovery.ts`（新增）、`src/app/play/page.tsx`（删除 5 个函数体，改为 import）。

**验证**：✅ 两个新文件各自的测试（8 + 13 = 21 例）全部通过；`tsc`/`eslint` 对 `page.tsx` 重跑确认零新增问题（原有的 5 条 hook-deps warning 与本次改动无关，行号因删除代码而整体上移，内容未变）。

---

### T7：观测性持久化升级

**改动**：`observabilityRing.ts`/`routingRing.ts` 此前是纯内存环形缓冲区（120/80 条上限），单进程重启即丢失，且 Next standalone 部署下每个 worker 进程各自独立，admin 面板只能看到"恰好处理这次请求的那个进程"的数据。本次复用项目已有的 Redis 客户端（`@/lib/ratelimit` 的 `getAppRedisClient`，已在限流/聊天队列/世界引擎队列广泛使用，零新增依赖）做"尽力而为"镜像：写入路径同步内存 push 不变（热路径不阻塞），额外 fire-and-forget 一次 Redis `LPUSH`+`LTRIM`；读取路径优先读 Redis（跨进程共享），不可用/为空时降级回内存 ring。这是本仓库第一次用 Redis List 原语（此前都是 GET/SET/EXPIRE），选择理由是 LPUSH 天然原子、不会像"整体 JSON 单 key SET"那样在并发写入下互相覆盖丢数据。

**文件**：`src/lib/ai/debug/observabilityRing.ts`、`src/lib/ai/debug/routingRing.ts`、`src/app/api/admin/ai-routing/route.ts`（两个 ring 的读取函数改为 async，改用 `Promise.all` 等待）。

**验证**：✅ 新增 `observabilityRing.test.ts`（6 例，覆盖往返读写、userIdHash 脱敏与确定性、120 容量 FIFO 淘汰、同步不阻塞）全部通过——沙箱未配置 `REDIS_URL`，实际验证的是"Redis 不可用时优雅降级为内存 ring"这条路径，即向后兼容基线。⚠️ `routingRing.ts` 因既有 `import "server-only"` 守卫，无法用 `tsx --test` 直接单测（该守卫在裸 Node 环境下会主动抛错，这是 `server-only` 包本身的设计），已改用同一套已验证正确的逻辑模式（与 `observabilityRing.ts` 完全一致），并用 `tsc`+`eslint` 做结构性验证；`observabilityRing.ts` 本身此前无此守卫，为保证可测性本次也未新增。⚠️ 未验证 Redis 实际可用时的真实读写路径（沙箱无 Redis 实例）。

---

### T4：世界知识检索升级调研（仅调研，未写代码）

**结论**：现有检索已经是"精确匹配 + tag 过滤 + Postgres FTS 全文检索"三层架构，FTS 层是真实生效的主力；向量检索层（`vectorSearch.ts`）是刻意预留的空壳骨架（`return []`）。Schema 里 `embeddingVector`/`contentTsv` 字段、`ensureSchema.ts` 里的 pgvector 探测与降级逻辑、多张表的 `ivfflat` 索引语句均已就绪，但当前 Postgres 镜像（`postgres:15-alpine`）未装 pgvector 扩展，`drizzle-orm@0.45.1` 也没有原生 `vector()` 类型支持，AI 网关层完全没有 embeddings 调用能力。三者叠加，真正启用向量检索需要一次数据库环境变更 + 一次 embedding 供应商选型决策，两者都需要用户参与，不适合在本次会话范围内直接实现。

**产出**：`docs/world-knowledge-vector-retrieval-assessment.md`（现状证据 + 3 个硬卡点 + 建议落地顺序）。

---

### T8：DB 技术债（仅生成方案，未执行迁移）

**结论**：
1. **表族重复的真实情况比最初判断的更明确**：`actorSessions`/`actorDailyActivity`/`actorDailyTokens` 三张表已建在每个环境的数据库里，但**全代码库零引用**——不是"两套系统都在写、数据不同步"，而是一次已建表但从未接上应用代码的半途重构。真正活跃的是 `userSessions`+`userDaily*`（注册用户）与 `guestRegistry`+`guestDaily*`（游客）两条并行链路。
2. **`sessionId`/`npcId` 类"缺失外键"大多不适合直接加约束**：`npcId` 指向的是活在 TS 代码里的静态注册表，数据库里根本没有 NPC 表可引用，加固应该走应用层校验而非 SQL 外键；`sessionId` 若加到 `userSessions.sessionId` 的外键会直接打断游客游玩（游客没有该表的行），除非先完成表族统一。
3. **pgEnum 化**是这份清单里唯一可以独立评审执行、风险最低的一类，但执行前必须先核对每个字段的历史数据是否有脏值。

**产出**：`docs/db-schema-technical-debt-proposal.md`（含逐条行号核实、修正了初步调研的错误结论、给出优先级建议表）。

---

## 三、明确排除的范围

- **3.0 合规自查、G6**：按用户指令原样跳过，未触碰任何合规相关逻辑。
- **G5**（剧本杀式分幕节奏打磨）：原调研报告标注为"偏内容设计、非纯代码"，本次全面聚焦可验证的工程改动，未纳入本轮。

## 四、遗留风险与建议后续（务必读）

1. **`taskV2.ts` 里的 `expiresAt`/`parseHoursIso` 单位不一致 bug（本次调研中发现，未修）**：`parseHoursIso()` 把 `expiresAt` 当成真实 ISO 时间戳换算成 epoch 小时数，但比较对象 `currentHourIndex` 是游戏内相对小时数（`day*24+hour`，量级很小）——如果 `expiresAt` 真被设置成某个具体 ISO 日期，`npc_grant` 任务的"未到触发时机"判断会失真。本次新增的 `autoFailAfterGameHour` 特意用了游戏内小时同一口径来避开这个坑，但没有回头修 `expiresAt` 本身，因为改动会牵涉 `applyNpcProactiveGrantGuard` 的既有任务发放路径，超出本轮任务边界。
2. **T2 的 JSON Schema 默认关闭**：需要用户在有真实 AI 网关凭证的环境里实测网关是否接受 `response_format: json_schema` 语法，再决定是否打开 `AI_GATEWAY_JSON_SCHEMA_ENABLED`。
3. **T6 只覆盖了 `page.tsx` 里 5 个函数**，该文件里还有约 9 个类似复杂度的纯函数（队列 UI 状态、语义等待分类等）未抽取；`route.ts` 完全未动——它是全仓库风险最高的文件，且没有"抽函数到独立文件"的既有先例（不像 `page.tsx` 有 `src/lib/play/*` 这个现成模式），贸然抽取需要更谨慎的独立评估，建议单独排期。
4. **T7 的 Redis 镜像路径完全未在真实 Redis 环境下验证**，仅验证了"无 Redis 时优雅降级"。建议用户在预发布环境观察一段时间的 `/api/admin/ai-routing` 响应，确认跨进程数据确实出现在 Redis 里（`redis-cli LRANGE vc:obs:ai_ring:v1 0 -1` 之类的手工检查）。
5. **T4/T8 都只产出方案文档，未改代码**，第一步都需要用户先做决策（T4：embedding 供应商与数据库环境；T8：`actor_*` 表族选方案 A 删除还是方案 B 完成迁移），决策后我可以继续推进具体实现。
6. **本次改动均未运行 `pnpm test:e2e:*`、`pnpm db:push`、`docker build`**，这些需要用户在有相应环境（真实/mock server、数据库连接、Docker）的机器上补跑，建议作为合并前的最后一道验证。
