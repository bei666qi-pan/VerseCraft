# Player Echo Canon 设计草案

## 0. 文档性质

本文只定义“玩家个人轮回痕迹层 / Player Echo Canon”的产品与技术边界，不改变当前运行时代码。

本轮不新增 UI、不修改 `src/app/play/page.tsx`、不修改 `/api/chat` 行为、不修改 stable prompt、不改数据库 schema、不增加依赖。

关联阅读：

- `AGENTS.md`
- `src/lib/memorySpine/types.ts`
- `src/lib/playRealtime/playerChatSystemPrompt.ts`
- `src/lib/npcConsistency/validator.ts`
- `src/lib/registry/npcCanonBuilders.ts`
- `src/lib/rollout/versecraftRolloutFlags.ts`

## 1. 功能定义

Player Echo Canon 是一个“玩家个人轮回痕迹层”：它记录同一玩家跨周目留下的少量情绪、动作、承诺、失败、相遇方式与关系残响，并在后续周目中以极轻量的方式影响叙事质感。

核心定义：

- 官方世界观不变。公寓规则、校源真相、NPC 正典身份、地点、物品、任务、结局机制仍由现有 registry、runtime lore、reveal tier、turn commit 与 validator 链路裁决。
- 个人残响不是世界事实。它不能改写 root truth，不能新增官方 canon，不能让 NPC 获得未授权的全知记忆。
- 个人残响只作为跨周目暗示。它可以表现为停顿、视线、措辞错位、情绪牵引、微弱熟悉感、书页隐喻或欣蓝式强牵引，但必须保持“似曾相识”而非“记得上周目全部事件”。
- Player Echo Canon 是 player-scoped，不是 world-scoped。它属于玩家存档与体验层，默认不进入全局世界知识，不参与其他玩家或官方世界线。

一句话边界：Player Echo Canon 让“这个玩家曾经如何经过这里”留下轻微回声，但不让“VerseCraft 的官方世界是什么”发生改变。

## 2. 非目标

本功能明确不做：

- 不新增 UI。不增加轮回图谱、回忆列表、残响面板、NPC 记忆面板或设置入口。
- 不让玩家编辑世界观。不提供自定义 canon、改写 NPC 正典、上传背景设定或声明真相的入口。
- 不让 NPC 全量记得上周目。普通 NPC 仍默认陌生；特殊 NPC 也只能在权限范围内表现牵引感。
- 不继承大量数值。不继承等级、道具库存、货币、任务完成状态、图鉴全量、战斗数值或经济优势。
- 不把 narrative 当状态真相源。残响候选可以从结构化回合结果、死亡、承诺、关系变化、任务残留等信号提取，不能靠解析长叙事自由补事实。
- 不改 `/api/chat` SSE / JSON 契约。不新增必填字段，不改变 `__VERSECRAFT_STATUS__` / `__VERSECRAFT_FINAL__` 规则。
- 不改 stable prompt。残响只能作为未来 runtime packet 的可选动态短包进入，且失败即空。
- 不改数据库 schema。v1 设计应优先复用现有存档/快照/会话扩展位或客户端持久化策略；若未来确需服务端持久化，必须另起 schema 设计与迁移评审。

## 3. 数据层概念

本节定义概念模型，不代表本轮新增 TypeScript 类型或数据库表。

### 3.1 PlayerEchoCanon

`PlayerEchoCanon` 是玩家维度的个人残响容器，描述“这个玩家跨周目可被轻微回声化的经历集合”。

建议字段：

- `version`：格式版本，便于旧存档迁移。
- `playerKey`：玩家或游客的稳定匿名键，不暴露给 prompt。
- `worldId`：当前世界，如 `dark_moon_prologue`，避免跨世界污染。
- `loopCount`：已完成或重开的周目计数，只用于裁剪强度，不直接给模型讲机制。
- `fragments`：`EchoFragment[]`，候选残响。
- `npcBonds`：`NpcEchoBond[]`，按 NPC 聚合的残响关系。
- `updatedAt`：最后刷新时间。

约束：

- `PlayerEchoCanon` 不等于官方 canon，不写入 world fact registry。
- 每次 prompt 注入前必须裁剪，只能输出 0-3 条 fragment。
- 任何读取失败、解析失败、版本不兼容或权限不明时，返回空 canon。

### 3.2 EchoFragment

`EchoFragment` 是单条残响，粒度应小于“完整回忆”，更接近 `MemorySpineEntry` 的极短脊柱摘要。

建议字段：

- `id`：稳定短 id。
- `kind`：残响类型，例如 `promise`、`debt`、`relationship_shift`、`death_mark`、`route_hint`、`danger_hint`、`secret_fragment`、`escape_condition`、`hook`。
- `summary`：极短摘要，建议不超过 40 个中文字符，只写体验或关系残留。
- `sourceLoop`：来自第几周目。
- `sourceTurnId`：可选，仅用于调试或去重，不进入 prompt。
- `anchors`：位置、NPC、任务、道具、楼层或世界 flag 锚点。
- `salience`：重要度 0..1。
- `confidence`：可信度 0..1；结构化来源高于 narrative 旁证。
- `revealTierMin`：允许暗示的最低 reveal tier。
- `allowedNpcPrivilege`：允许触发的 NPC 权限集合，如 `normal`、`major_charm`、`night_reader`、`xinlan`。
- `tone`：表现方式，例如 `unease`、`familiar_pull`、`page_metaphor`、`xinlan_anchor`。
- `status`：`active`、`consumed`、`expired`。

写入原则：

- 只收窄，不扩张。摘要必须比原事件更保守，不能补全未发生事实。
- 优先来自结构化字段：死亡、关系变化、承诺、任务残留、地点变化、危险提示、物品来源等。
- 不记录原始玩家输入全文、完整 narrative、完整 prompt 或隐私内容。

### 3.3 NpcEchoBond

`NpcEchoBond` 描述某个 NPC 与玩家个人残响之间的聚合关系，用于控制“谁可以表现怎样的熟悉感”。

建议字段：

- `npcId`：NPC 正典 id。
- `memoryPrivilege`：沿用现有 NPC canon 权限：`normal`、`major_charm`、`night_reader`、`xinlan`。
- `recognitionMode`：最高识别模式，不能超过 NPC canon builder 对该权限的上限。
- `bondScore`：残响牵引强度 0..1，只影响微表演，不等于关系数值继承。
- `fragmentIds`：关联的少量 fragment id。
- `lastEchoedAtLoop`：上次被注入的周目，避免重复口头禅。
- `cooldownTurns`：冷却，防止每回合都“似曾相识”。

约束：

- `NpcEchoBond` 不替代 `npcHeart`、关系值、任务关系或 official NPC canon。
- 普通 NPC 的 `recognitionMode` 不得超过 `emotional_residue`。
- `xinlan` 可有更强牵引，但 reveal tier 不足时仍不能说破根因、七锚、闭环机制或通关链路。

## 4. Prompt 原则

残响只允许作为未来动态 runtime packet 的可选短包，不写入 stable prompt。

硬规则：

- 每回合最多注入 0-3 条残响。
- packet 总长度最多 420 个中文字符。
- 失败即空：读取失败、筛选失败、超预算、权限不明、reveal tier 不足或热路径压力过高时，直接不注入。
- 只给表现提示，不给正典结论。packet 应写“可表现一瞬停顿/违和/牵引”，不写“NPC 记得上一周目发生了 X”。
- 不得包含完整上周目事件链、完整玩家输入、完整 narrative 或任何模型可复述的长事实。
- 不得扩大 stable prompt。所有规则应进入代码 validator、packet builder、测试或文档，不把长规则堆进 `buildStablePlayerDmSystemLines()`。

建议 packet 形态：

```text
【玩家个人残响（可选短包）】
本包只允许写成体感暗示，不是世界真相。失败或冲突时忽略。
- N-010：可有强牵引，但不得说破轮回根因。
- B2/出口：玩家曾在相近门槛前失败；只写指尖迟疑或冷感。
```

筛选顺序：

1. 先按当前场景锚点过滤：位置、在场 NPC、当前任务、危险源。
2. 再按 NPC `memoryPrivilege` 与 `revealTier` 过滤。
3. 再按 salience、cooldown、最近是否已注入排序。
4. 最后按 420 字和 0-3 条硬截断。

## 5. NPC 首见规则

“首见”指当前周目内该 NPC 与玩家首次同场或首次有效开口。Player Echo Canon 只能影响首见时的微反应，不改变 NPC 的正典身份、地点或任务职责。

| NPC 权限 | 首见表现 | 禁止表现 |
| --- | --- | --- |
| `normal` | 陌生 + 轻微违和。可以停顿、皱眉、回避、觉得玩家“和其他误闯学生不太一样”。 | 不得说“你又来了”“我记得你”“上次你死在这里”。不得默认旧友、队友或知情人。 |
| `major_charm` | 情绪牵引。可以表现声线、目光、动作节奏被玩家牵动，像被某个未完成的承诺擦过。 | 不得全量记得上周目，不得直接给出学校根因、闭环机制或其他 NPC 私密事实。 |
| `night_reader` | 书页隐喻。可以把玩家写成“页边重复出现的墨迹”“没翻完的页脚”，保持观察者式熟悉感。 | 不得温情认亲，不得把隐喻升级成明确记忆账本，不得替系统解释轮回。 |
| `xinlan` | 强牵引但不说破。可以有名单焦虑、登记口牵引、强烈熟悉与阻止冲动。 | reveal tier 不足时不得一口说尽根因、七锚、通关链路、学校碎片全貌。 |

首见降级：

- 如果当前没有焦点 NPC，残响包不注入 NPC 口吻，只能作为环境体感。
- 如果多名 NPC 同场且焦点不明，普通 NPC 全部按陌生处理。
- 如果 NPC canon 与残响冲突，以 NPC canon、scene authority、reveal tier 为准。

## 6. Validator 规则

未来落地时，validator 必须是纯函数、无 IO、无数据库访问、无 LLM、无网络，输入由调用方传入结构化上下文。

建议规则：

1. 普通 NPC 不得说“你又来了”“我记得你”“我们上次”“又死了一次”等明确跨周目台词。
2. 残响不得覆盖当前周目事实。当前地点、在场 NPC、已获得物品、任务状态、关系状态、危险状态以本周目结构化状态为准。
3. revealTier 不足不得说破轮回。任何闭环机制、七锚、学校根因、深层身份、通关链路都必须受 reveal tier 与对应 packet 双重门闸控制。
4. `major_charm` 与 `night_reader` 的熟悉感只能是情绪/隐喻层，不能升级为 exact memory。
5. `xinlan` 可强牵引，但不得无条件全知复述；仍要服从 `xinlan-anchor` 与 reveal gate。
6. 残响文本不得生成新 factId，不得被写入 official world fact registry。
7. 残响不得与 `_narrative_audit.used_fact_ids` 形成虚假证明；个人残响不是官方事实证据。
8. 若 narrative 把残响写成确定事实，validator 应触发 telemetry，并优先改写为模糊体感或移除相关句子。

建议违规类型：

- `player_echo_normal_npc_loop_memory`
- `player_echo_current_run_override`
- `player_echo_reveal_tier_overreach`
- `player_echo_fact_commit_leak`
- `player_echo_privilege_overreach`

## 7. 性能红线

Player Echo Canon 不得增加 `/api/chat` 首包风险。

硬约束：

- 不得阻塞 `/api/chat` 首包、首个 status frame 或首个可见正文。
- 不得增大 stable prompt。
- 不得在热路径引入 LLM 调用。
- 不得做热路径数据库 schema 查询扩张；v1 应优先使用已在内存/快照/请求上下文中可得的短数据。
- 不得增加跨服务依赖、网络调用或大型 RAG 检索。
- 筛选必须有 wall-clock budget；超时即空。
- packet builder 必须 fail-open：任何异常都返回空字符串，并记录结构化 telemetry。
- benchmark 预算必须覆盖有残响、无残响、读取失败、超预算、权限冲突五类场景。

预算建议：

- 同步筛选 p95 小于 5ms。
- packet 构造 p95 小于 10ms。
- 最终注入字符数 p95 小于 420 字。
- 单回合 fragment 候选池进入排序前应先硬截断，避免 O(n) 大集合进入 prompt 热路径。

## 8. 分阶段落地计划

### P0：文档与测试夹具设计

- 固化本设计文档。
- 梳理可复用的 `MemorySpineKind`、NPC `memoryPrivilege`、现有 validator 违规类型。
- 设计 fixtures：普通 NPC 首见、major charm 首见、夜读老人隐喻、欣蓝强牵引、reveal tier 不足、当前周目事实冲突。

验收：

- 无运行时代码改动。
- 文档覆盖功能定义、非目标、数据概念、prompt、validator、性能与测试清单。

### P1：纯函数数据模型与裁剪器

- 新增概念类型与纯函数 selector，但不接入 `/api/chat`。
- 输入 `PlayerEchoCanon`、当前场景、NPC canon、reveal tier，输出 0-3 条 `EchoFragment`。
- 所有失败路径返回空数组。

建议测试：

- 空 canon 返回空。
- 超过 3 条时按 salience 和 cooldown 裁剪。
- reveal tier 不足时过滤深层 fragment。
- 普通 NPC 不能拿到 exact memory。

### P2：动态 packet builder，默认关闭

- 以 feature flag 灰度接入动态 suffix 的候选 packet，不改 stable prompt。
- packet 长度上限 420 字。
- 读取或构造失败即空。

建议测试：

- 420 字硬上限。
- 0-3 条硬上限。
- 多 NPC 焦点不明时降级为空或环境体感。
- flag 关闭时完全不注入。

### P3：post-generation validator

- 增加纯函数 validator，检测普通 NPC 轮回记忆、当前周目覆盖、reveal tier 越界、fact commit 泄漏。
- 初期 telemetry-only；稳定后再允许保守 rewrite。

建议测试：

- 普通 NPC “你又来了”被标记。
- `xinlan` 强牵引但未说破时通过。
- reveal tier 不足时直接说破闭环被标记。
- 残响与当前地点冲突时被标记。

### P4：存档/周目边界接入

- 只在明确新周目/结局/死亡/重开边界生成少量 fragment。
- 不继承数值，不回写官方 world fact。
- 不新增 UI。

建议测试：

- 死亡残响可生成 `death_mark`，但不改变下一周目生命/道具/任务。
- 承诺残响可影响同 NPC 微反应，但不自动创建任务。
- 旧存档无 echo 字段时安全迁移为空。

### P5：质量评估与浏览器验证

- 增加 golden scene，覆盖首见与 reveal gate。
- 增加 chat metrics 场景，确认 TTFT 与 final budget 不受明显影响。
- 浏览器验证只看行为不崩、不出现禁语、不新增 UI。

## 9. 测试清单

文档阶段：

- `git diff --check`
- Markdown 不进 eslint；不运行 `npx eslint docs/design/player-echo-canon.md`
- 指定源码 lint：`npx eslint src/lib/memorySpine/types.ts src/lib/npcConsistency/validator.ts`

未来代码阶段：

- `npx eslint src/lib/playerEchoCanon/*.ts src/lib/npcConsistency/validator.ts`
- `npx tsx --test src/lib/playerEchoCanon/*.test.ts`
- `npx tsx --test src/lib/npcConsistency/*.test.ts`
- `pnpm test:e2e:contract`
- `AI_PROVIDER=mock pnpm benchmark:chat-metrics -- --mode mock --assert-budget --include-all --json-out .runtime-data/chat-benchmark-mock.json`
- 至少一组 `/play` 浏览器验证，确认没有新增 UI、没有普通 NPC 说破轮回、没有 SSE contract 变化。

## 10. 回滚策略

未来落地必须满足：

- 单一 feature flag 可关闭残响注入。
- validator 可独立 telemetry-only / rewrite 关闭。
- packet builder 关闭后 `/api/chat` prompt 与当前行为保持一致。
- 数据读取失败、版本不兼容、预算超时全部返回空，不影响主回合。
- 没有 schema 迁移依赖时，回滚不需要数据库操作。
