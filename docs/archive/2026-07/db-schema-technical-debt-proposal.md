# 数据库 Schema 技术债清单与方案（T8）

> 调研时间：2026-07。本文档只做现状梳理与方案设计，**未执行任何迁移、未运行 `pnpm db:push`、未修改 `schema.ts`**。
> 所有结论均已逐条核对 `src/db/schema.ts` / `src/db/ensureSchema.ts` 原文与实际调用点，而非只转述初步调研；其中一处初步调研结论（"三表族都在被写入"）经核实后是**错的**，已在下面第 2 节改正——这也是本文档坚持"先核实、再下结论"的原因。

## 1. 表族重复：并非三方都在用，而是"一个已弃用的未完成重构"

初步调研曾认为 `userSessions`/`actorSessions`、`userDailyActivity`/`actorDailyActivity`、`userDailyTokens`/`actorDailyTokens` 是"两套都在写，数据不同步"的活跃重复。实际逐一核实写入/读取调用点后，结论不同：

- `userSessions`（`schema.ts:541`）：**活跃**。`src/lib/presence.ts:49` 写入，`src/lib/admin/service.ts:583`、`src/lib/analytics/realtime.ts:40` 读取。
- `actorSessions`（`schema.ts:470`）：**在整个 `src/` 里零引用**（除 schema.ts 自身定义外，没有任何文件 import 或查询它）。
- `actorDailyActivity`（`schema.ts:496`）/`actorDailyTokens`（`schema.ts:521`）：同样**零引用**。
- 但这三张表**确实存在于每个真实数据库里**——`src/db/ensureSchema.ts:440-499` 会无条件 `CREATE TABLE IF NOT EXISTS actor_sessions/actor_daily_activity/actor_daily_tokens`，只是建完之后从未有代码写入或读取。
- 与此同时，`guestRegistry`/`guestDailyActivity`/`guestDailyTokens`（`schema.ts:602/619/634`）是**另一套独立、确实活跃**的体系，专门服务游客：写入方 `src/lib/presence/upsertGuestRegistry.ts`，读取方 `src/lib/quota.ts`、`src/lib/admin/service.ts`。

**真实现状**：当前生产上其实是"`user_*`（注册用户）+ `guest_*`（游客）两条并行活跃链路"，而 `actor_*` 三张表看起来是有人已经设计好、并且已经建表上线的"注册用户+游客统一模型"，但**应用代码从未切过去**——是一次半途而废的重构，不是两套互相踩踏的活跃系统。

**对风险等级的修正**：不是"数据不一致"风险（因为 actor_* 根本没数据），而是：
- 3 张表在每个环境里白占用磁盘和 `ensureSchema` 建表耗时，没有任何实际价值。
- 如果未来有人真的想统一 user/guest 追踪模型，这 3 张表的字段设计已经比 user_*/guest_* 更完整（多了 `onlineSec`/`activePlaySec`/`readSec`/`idleSec` 细分、`actorType`/`guestId` 统一维度），是可以复用的起点，只是需要有人真正做完"迁移应用代码指向 actor_*，下线 user_*/guest_*"这最后一步。

**建议（二选一，需要产品/工程决策，本次不代为决定）**：
- **方案 A（推荐，风险更低）**：直接删除 `actor_sessions`/`actor_daily_activity`/`actor_daily_tokens` 三张未使用的表（连同 schema.ts 里对应的 3 个 `pgTable` 定义与 `ensureSchema.ts` 里对应的建表语句），承认这次重构没有完成，回到"user_* + guest_*"这个当前唯一活跃、且工作正常的模型。执行前必须先确认没有任何外部工具/BI/手工 SQL 依赖这 3 张空表。
- **方案 B（收益更大但工作量也更大）**：真正完成这次重构——把 `presence.ts`、`admin/service.ts`、`analytics/realtime.ts`、`quota.ts`、`upsertGuestRegistry.ts` 里对 `userSessions`/`userDailyActivity`/`userDailyTokens`/`guestRegistry`/`guestDailyActivity`/`guestDailyTokens` 的读写都改成统一走 `actorSessions`/`actorDailyActivity`/`actorDailyTokens`，验证无误后再下线旧表族。这是一次跨多个模块的行为迁移，需要独立排期与充分的读写路径测试，不适合在本次"生成方案不执行迁移"的范围内顺带做掉。

## 2. 疑似应为外键、实际是裸字段的引用键

通篇扫描后，`sessionId`/`npcId`/`actorId`/`fromNpcId`/`toNpcId` 这类"看起来引用另一实体"的字段广泛存在于以下表中（均为裸 `varchar`，无 `.references()`）：

`storyEvents.sessionId`（`schema.ts:203`）、`storyEvents.actorId`（`:212`）、`npcMemoryEntries.npcId`（`:260`）、`npcMemoryEntries.sessionId`（`:261`）、`narrativeRuns.sessionId`（`:234`）、`npcAgentState.sessionId`/`npcId`、`npcRelationEdges.sessionId`/`fromNpcId`/`toNpcId`、`worldEngineEventQueue.sessionId`、`worldEngineAgendaSnapshots.sessionId`、`worldEngineDirectorState.sessionId`、`socialEventLedger.sessionId`。

**关键澄清（初步调研没有讲清楚的一点）**：这些字段"没有外键"，很可能不是疏漏，而是**根本没有可以引用的表**：

- **`npcId` 类字段**：本项目的 NPC 定义活在 `src/lib/registry/npcs.ts` 这样的静态 TypeScript 注册表里，**数据库里不存在 NPC 主表**。这是 CLAUDE.md 里明确的既定架构（"World Knowledge 双源模式"，registry 是 bootstrap/seed 数据源，不是运行时可写的数据库实体）。给 `npcId` 加数据库外键，前提是先把 NPC 注册表整体迁移进数据库——这是一次架构级变更，会破坏"registry 活在代码里、DB 只存运行时状态"的现有原则，本文档不建议这样做。更合适的加固方式是**应用层校验**（写入前检查 `npcId` 是否在 `getAllNpcIds()` 之类的注册表函数返回值里），而不是 SQL 外键。
- **`sessionId` 类字段**：`userSessions.sessionId`（`schema.ts:544`）是该表主键，理论上其他表的 `sessionId` "看起来"该指向它。但本项目同时支持**游客游玩**（无需注册），游客的 `sessionId` 不会在 `userSessions` 里有对应行（游客走的是 `guestRegistry`/`guest_sessions`，字段结构不同，也没有以 `sessionId` 为主键的游客会话表）。如果给这些字段加 `.references(() => userSessions.sessionId)`，**所有游客产生的 story_events/npc_memory_entries 等记录都会外键校验失败**，是一个会直接打断游客可玩性的破坏性变更。这些 `sessionId` 更准确的定位是"跨表关联用的应用层生成的相关性 ID"，不是"数据库某张会话主表的从属外键"。如果确实想要数据库层面的约束，前提是先有一张同时覆盖注册用户与游客、以 `sessionId` 为主键的统一会话表——这正好呼应第 1 节里"完成 actor_* 迁移"的方案 B；两个技术债项事实上是同一个根因（缺一张统一的会话主表）的两种表现。

**结论**：这批"缺失外键"目前建议**保持现状，不要盲目加 `.references()`**，除非先完成第 1 节的表族统一。真正能立刻做、且没有副作用的加固是应用层校验（比如给 `npcId` 写入路径加一层"是否是已知 NPC id"的检查），而不是数据库约束。

## 3. 应为 pgEnum 但目前是裸 varchar 的字段（可独立执行，风险最低）

这一类和第 1、2 节不同：**不涉及跨表关系、不涉及游客/注册用户的兼容性问题**，是这份清单里唯一可以独立评审、独立执行、且几乎没有副作用的一类改动。以下字段命名/取值明显是有限枚举集合，代码里也能找到对应的 TypeScript union 类型：

| 表 | 字段 | 行号 | 已知 TS union（需在实施前重新核对完整取值） |
|---|---|---|---|
| `safetyAuditEvents` | `decision` | `~687` | `ModerationDecision`（`src/lib/safety/policy/model.ts:10`）="allow"\|"rewrite"\|"fallback"\|"reject" |
| `safetyAuditEvents` | `riskLevel` | `~688` | `RiskLevel`（`src/lib/safety/policy/model.ts:1`）="allow"\|"review"\|"soft_block"\|"hard_block" |
| `worldEngineEventQueue` | `status` | `~995` | 需对照 `src/lib/worldEngine/*` 里状态机定义逐一核对 |
| `worldEngineDirectorState` | `phase` | `~1044` | 需对照 `useGameStore.ts` 里 director/threat phase 定义 |
| `worldEntities` | `entityType` / `status` / `scope` | `~781/792/789` | 需对照 `src/lib/worldKnowledge/types.ts` |
| `worldKnowledgeChunks` | `embeddingStatus` | `888` | 代码里可见 `"pending"`（见 `docs/world-knowledge-vector-retrieval-assessment.md` 已核实），完整取值需核对写入点 |

> 表中行号为初步调研结果，**在真正执行前必须逐条重新用 `Grep`/`Read` 核对当前行号与完整取值集合**（本文档没有对每一行都做逐字核对，只对上面明确列出 TS 来源的 2 行做了核实）。

**建议的最小风险执行方式**：pgEnum 迁移不能像"加索引"一样零风险——Postgres 的 `ALTER TABLE ... ALTER COLUMN ... TYPE enum_type` 需要确保表内现存所有历史数据的值都落在新枚举集合内，否则迁移会直接失败。执行前必须先跑一遍 `SELECT DISTINCT <字段> FROM <表>` 对照代码里的 union 类型，确认没有历史脏数据（比如已下线的旧枚举值、大小写不一致、空字符串）。这一步排查工作量不小，且需要能连到目标数据库，不在本次"仅生成方案"的范围内完成。

## 4. Schema 与真实 DB 的既有 drift（已在 T4 文档详述，此处仅提要）

`worldKnowledgeChunks.contentTsv`/`embeddingVector` 两个字段在 `schema.ts` 里用 `text()` 占位，真实建表类型由 `ensureSchema.ts` 探测环境后动态决定（`tsvector`/`vector(256)` 或降级为 `TEXT`）。这是刻意设计、行为符合预期，不是需要"修复"的 bug，但对不熟悉这段代码的人可能造成"schema.ts 撒谎"的误解。详见 `docs/world-knowledge-vector-retrieval-assessment.md` 第 2 节，此处不重复展开。

## 5. 迁移流程现状

项目**没有 Drizzle 版本化迁移目录**（没有 `drizzle/migrations/*.sql` 之类的历史记录）。所有 schema 变更通过 `src/db/ensureSchema.ts` 里手写的 `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` 幂等语句实现，由 `MIGRATE_ON_BOOT`（见 `docs/environment.md`/`docs/deployment-coolify.md`）之类的环境变量控制是否在启动时执行。这意味着：

- 新增字段/建新表：现有模式很成熟，风险低，照抄现有写法即可。
- **删除字段/改变字段类型**（比如本文档第 1、3 节的建议）：现有的"幂等 ADD COLUMN"模式不天然支持，需要额外手写"检测旧数据是否兼容→转换→切换类型"的一次性脚本，且这类脚本**没有回滚机制**，一旦在生产跑错无法自动撤销。这是本文档所有建议都停在"方案"而非"执行"的根本原因——不是嫌麻烦，是这类变更本身就需要人在场、看着数据跑，且最好先在测试环境验证一遍。

## 6. 总结与优先级建议

| 项 | 建议顺序 | 风险 | 是否需要人工决策 |
|---|---|---|---|
| 删除/完成 `actor_*` 三张未使用表（第1节） | 1（最值得先做决定） | 低（方案A）/ 中高（方案B） | 是——A 还是 B 需要产品判断是否要做游客/用户统一 |
| pgEnum 化（第3节） | 2 | 低，但执行前必须核对历史脏数据 | 否，纯工程决策，可独立排期 |
| `sessionId`/`npcId` 外键加固 | 3（依赖第1节结论） | 高（若不先解决统一会话表问题，贸然加约束会打断游客可玩性） | 是——需先决定是否统一会话模型 |
| 建立版本化迁移流程（第5节） | 4（长期基础设施投入） | 低 | 否，纯工程决策 |

本文档到此为止均为评估与方案；如果需要，下一步应该先让用户对"第1节方案A/B"和"是否值得投入建立版本化迁移流程"两件事拍板，再进入具体实施排期。
