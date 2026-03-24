# 世界知识 RAG 架构设计（VerseCraft）

> 本文档最初是迁移设计稿；当前代码已落地其中的关键链路。阅读本文件时，以“运行时现状 + 兼容边界”为准，不以“未来式计划”作为当前事实。

## 1. 当前问题审计

### 1.1 世界观事实硬编码在前端/静态 TS 的边界

当前仓库存在多处“事实源职责”被前端或静态 TS 承担，主要集中在 `src/lib/registry/*` 与 `src/lib/playRealtime/playerChatSystemPrompt.ts`，以及部分 UI/Store 的直接引用：

1. 世界结构与地图节点（`src/lib/registry/world.ts`）
   - 楼层与出生/出口（如 `FLOORS`、`SPAWN_FLOOR`、`EXIT_FLOOR`）
   - 地图房间节点（`MAP_ROOMS`）
   - 战力/规则硬锚（如 `MANAGER_TRUE_COMBAT_POWER`、`B2_BOSS_LOCKED_FAVORABILITY`）
   - NPC 社交图与固定 lore（`NPC_SOCIAL_GRAPH`）
2. 公寓“真相档案”（`src/lib/registry/apartmentTruth.ts`）
   - `APARTMENT_TRUTH`：建筑本质、空间泄露、暗月/终焉禁忌词机制、13 楼/出口机制等大段 lore
3. 实体与规则（`src/lib/registry/npcs.ts`、`anomalies.ts`、`items.ts`、`rules.ts`）
   - NPC / 诡异的外观、taboo/weakness、杀戮规则、存活方法等
   - 道具与其副作用、触发条件、tags
   - 固化守则（`APARTMENT_RULES`）
4. 前端/客户端侧承担“事实源职责”的典型引用
   - `src/store/useGameStore.ts`：直接 import `ITEMS` 与 `NPC_SOCIAL_GRAPH`（用于渲染、初始化与图鉴/交互逻辑）
   - `src/components/UnifiedMenuModal.tsx`、`src/app/play/page.tsx`：直接 import `NPCS`/`ITEMS`（用于 UI 展示与道具可用性判断）

结论：`registry` 目前既承担“展示配置”，又承担了“运行时世界观事实源”的职责；而事实源职责又被 `playerChatSystemPrompt.ts` 直接串入系统提示，从而造成 token 成本、维护耦合与动态更新困难。

### 1.2 哪些逻辑把大段 lore 注入 prompt

关键注入点位于 `src/lib/playRealtime/playerChatSystemPrompt.ts`：

- 稳定前缀生成：`buildStablePlayerDmSystemLines()`
  - 直接嵌入 `buildApartmentTruthBlock()`（完整 `APARTMENT_TRUTH`）
  - 直接嵌入 `buildLoreContextForDM()`（遍历 `NPC_SOCIAL_GRAPH`，把每个 NPC 的 `fixed_lore`、`core_desires`、`immutable_relationships`、以及少量 speech/emotional traits 逐段拼接为 lore）
- 前后端回合组装：`src/app/api/chat/route.ts`
  - 把 `getStablePlayerDmSystemPrefix()`（稳定前缀，含全量 lore）与 `buildDynamicPlayerDmSystemSuffix()`（动态记忆与回合上下文）拼成 system messages
  - SSE 流式输出与 DM JSON 契约本身并未在此阶段改变

当前架构已演进为“稳定规则前缀 + 动态检索 lore 注入（RAG）”并存：`/api/chat` 运行时会调用 `getRuntimeLore(...)` 并把结果拼入动态后缀，registry 继续承担 bootstrap/fallback。

### 1.3 Prompt 体积、可维护性、扩展性、动态更新与记忆扩展风险

1. 体积风险
   - 稳定前缀包含全量 `APARTMENT_TRUTH` 与全量 `NPC_SOCIAL_GRAPH fixed/immutable` 文本
   - 结果：每次回合输入 token 与延迟成本偏高，且难以用缓存完全解决（因为稳定前缀虽然可 memo，但总 token 仍大）
2. 可维护性风险
   - `registry` 文本、prompt 约束、以及“严禁新增/修改”合规逻辑混在同一个 prompt 生成链路里
   - 新增/修订实体/规则时，必须同步思考：
     - registry 内容是否仍符合“世界观锚点绝对法则”
     - prompt 中 lore 块位置与长度是否影响模型遵循
3. 动态更新风险
   - 当前动态记忆只来自 `src/app/api/chat/route.ts` 对 `game_session_memory` 的压缩快照（`buildMemoryBlock()`），并非从“知识层检索事实”
   - `src/lib/kg` 已实现用户知识候选/共识/写入 `vc_world_fact` 的流程；`/api/chat` 也已接入运行时检索注入链路，当前重点是继续治理检索预算与兼容边界
4. 玩家私有记忆与共享世界扩展风险
   - 玩家私有记忆目前只有 session 级 `plot_summary/player_status/npc_relationships`（由 DB 快照提供）
   - 共享世界增量知识已进入运行时事实链路，但仍需通过预算/优先级/fallback 策略控制注入规模
   - 一旦直接把“所有 registry + 所有知识”都塞入 prompt，将导致新的 token 成本与泄露/一致性风险

## 2. 目标企业化架构

### 2.1 文字版架构图（分层视角）

#### 2.1.1 世界知识分层

- `CoreCanon`
  - 开机即用的最小世界锚点：合规、JSON 协议、实体/位置/ID 白名单约束、禁止新增/修改实体与机制的规则摘要等
- `SharedPublicLore`
  - 跨用户共享的世界事实：来自 PostgreSQL 的世界事实集合（初期可映射为现有 `vc_world_fact` 的热事实集合）
- `UserPrivateLore`
  - 玩家私有世界知识：来自 `vc_user_fact`（以及可能的 session 扩展快照）
- `SessionEphemeralFacts`
  - 本回合短生命周期事实：`playerContext`、本回合动作输入摘要、控制面信息（但不承担静态事实源职责）

#### 2.1.2 存储分层

- PostgreSQL（事实源 + 检索）
  - 精确键检索：entityId/factKey/normalized_hash -> fact 文本块
  - 标签过滤：按 fact_type、tags、entity 类型过滤
  - 全文检索（FTS）：对 canonical_text 做关键词召回
  - 向量检索：复用现有 pgvector 结构（仓库已使用 `vector(256)` 与 ivfflat）
- Redis（热缓存与检索缓存）
  - 热 key：实体快照（NPC/诡异/道具片段裁剪后的只读块）
  - 检索结果缓存：按 `world_revision + 请求指纹` 缓存“召回的 fact ids 列表”
  - Prompt 片段缓存：按回合维度缓存“重排后的 lore block”（短 TTL，避免泄露与过期一致性问题）

#### 2.1.3 检索分层

- 精确键检索（Key Lookup）
  - 从 `latestUserInput` 与 `playerContext` 中抽取显式可映射键（如 npcId/anomalyId/itemId 或可解析的 factKey）
- 标签过滤（Tag Filter）
  - 先根据类型预算选择候选集合，再做小范围召回与去重
- 全文检索（FTS Search）
  - 对 canonical_text（事实文本）执行关键词召回，返回 topN
- 向量检索（Vector Search）
  - 使用 pgvector cosine / `<=>` 距离检索，配合 `is_hot` 与 world_revision 门控
- 混合召回（Hybrid Recall）
  - 并行拿到 key/FTS/vector 候选，统一格式后去重
  - 使用启发式得分：相似度、tag 命中、fact_type 优先级、规则优先级
- 重排（Rerank）
  - 本阶段建议先做启发式重排接口；下一阶段预留“可接入 reranker”的位置（可由规则/小模型实现，也可保持纯启发式）

#### 2.1.4 Prompt 分层

- 稳定前缀（Stable Prefix，不动）
  - 合规红线、JSON-only 协议、叙事沉浸红线、世界观“不泄露底色”的锚点规则
  - 实体/机制 ID 的白名单与禁用“新增实体/规则”的约束摘要
- 动态 lore 注入（RAG Block）
  - 在 dynamic suffix 组装中插入 `RagLoreFactsBlock`
  - 让模型在不改变 DM JSON 契约的情况下获得“当回合最相关的世界事实”

### 2.2 目标架构与现有仓库 KG 体系的对齐

仓库已存在 `src/lib/kg/*` 的一部分“知识流”能力：

- `src/lib/kg/ingest.ts`：把用户输入分流到 `vc_user_fact`（私有事实）或 `vc_world_candidate`（公共共识候选）
- `src/lib/kg/janitor.ts` 与 `src/lib/kg/consensus.ts`：离线审核与共识晋升，最终写入 `vc_world_fact` 并 bump `world_revision`
- `src/lib/kg/semanticCache.ts`：对 codex narrative 做语义缓存（当前主要服务 codex 查询，不承担每回合 lore 注入）

因此，本目标架构是在现有 KG/pgvector 体系上扩展“RAG 检索 -> 动态 lore 注入 prompt”的运行时链路，同时不推翻 ai/governance 的缓存与 SSE JSON 契约。

## 3. 明确哪些内容继续保留在代码中

1. 极少量“开机即用”的最小核心世界锚点
   - `src/lib/playRealtime/playerChatSystemPrompt.ts`
     - 合规红线与拒绝规则（中国大陆合规）
     - DM 输出 JSON-only 协议与字段默认值策略
     - “世界观锚点绝对法则（Lore Anchor）”：禁止凭空捏造、禁止新增实体/规则、强调固定 lore/immutable_relationships 的一致性
2. 数据 schema / 类型定义 / 迁移脚本
   - 以 Drizzle 为主：`src/db/schema.ts`（现有世界会话记忆表、用户配额等）
   - 以运行时安全兜底为辅：`src/db/ensureSchema.ts`（首次部署创建 KG / cache 必要表）
   - 以迁移脚本为兜底：`scripts/migrate.js`（对 KG 表与 analytics 表做幂等创建）
3. registry 仅保留 bootstrap seed/fallback
   - `src/lib/registry/*` 不再承担“运行时事实源职责”
   - 作为 CoreCanon facts 的初始种子来源
   - 作为 DB 缺失/检索失败时的退化回填（短期策略，避免上线初期不可用）

## 4. 明确哪些内容迁移到数据库

迁移对象遵循“静态 lore -> facts store”的原则，并且按世界知识分层落库：

1. NPC、诡异、规则、地点、道具、关系、事件碎片
   - NPC/诡异：固定的 `lore`、`fixed lore`/`taboo`/`weakness`/`killingRule`/`survivalMethod`、以及必要的实体标识与位置归属
   - 规则：`APARTMENT_RULES` 等守则文本块
   - 地点/房间节点：`MAP_ROOMS` 的节点列表与可遍历结构（以及“不可新增”的约束摘要）
   - 道具/物品：`ITEMS`/warehouse items 的描述与触发条件（只需要服务检索的文本片段，不一定要全部属性进检索字段）
   - 关系与依赖：NPC 社交图（`NPC_SOCIAL_GRAPH`）中的关系文本，以及 core_desires / immutable_relationships
   - 事件碎片：暗月阶段机制、出口机制与关键时间规则（例如 B2/B2 boss 的硬锚）
2. 玩家私有世界知识
   - session 快照继续保留：`game_session_memory.plot_summary/player_status/npc_relationships`
   - 玩家互动沉淀到事实源：把 `vc_user_fact.fact_text` 纳入 UserPrivateLore 检索注入（必要时扩展为带标签/规范化字段的结构）
3. 共享世界增量知识
   - 共识后的公共事实：`vc_world_fact`（由 `vc_world_candidate` 经过 janitor/consensus 晋升而来）
   - 作为 SharedPublicLore 检索注入

## 5. 单机 4C8G 优化策略（成本、响应与稳定性）

1. Redis 仅做热 key、热检索结果、Prompt 片段缓存、实体快照缓存
   - 缓存粒度尽量小：只缓存“需要注入 prompt 的 lore block 片段”
   - TTL 短：例如 1-5 分钟级别用于 prompt 片段；检索结果可略长但仍必须受 world_revision 影响
   - key 命名需要包含 `world_revision`：避免“事实更新后旧块继续注入”
2. PostgreSQL 负责主存储、过滤、FTS、向量检索
   - 利用仓库已存在的 ivfflat 设置与连接池 max=10 的约束
   - 只进行短事务、单次检索查询、尽快释放连接（避免挤占 /api/chat 主链路）
3. Embedding 只在新增/变更知识时生成
   - registry bootstrap seed 时：一次性生成并写入事实表
   - 新增共识/审核通过写入时：在 janitor/consensus 写入 `vc_world_fact` 时生成 embedding（仓库现已有 `embedText()` 逻辑）
   - 每回合绝不生成 embedding：每回合检索只使用入参的 query_embedding 或缓存
4. 检索预算必须可控，避免每次回合全量扫描
   - `topN` 分别为 key/FTS/vector 的小常数（例如 3-8 的量级）
   - 向量检索优先 `is_hot=true` 的热事实集合
   - 如果热集合不足，再按 small budget 拉取补充冷事实

## 6. 渐进迁移策略（不改业务逻辑的最小骨架路径）

### 第一步：支持 DB 优先 + registry fallback（先不接 prompt 注入）

- 在服务端新增 `worldKnowledge` runtime retrieval 接口：
  - 当 DB/检索不可用时，返回空集合或基于 registry 的短摘要（降级回填）
  - 不改 `/api/chat` 当前的稳定前缀全量 lore 拼接逻辑（避免 token 结构变化导致模型行为漂移）

目标：完成“事实源与检索链路存在，但暂不改变 chat 行为”的最小骨架准备。

### 第二步：prompt 改为“核心规则固定 + 动态 lore 检索注入”

- 保持稳定前缀不动（合规/JSON 协议/沉浸红线）
- 把动态 lore 从：
  - `buildApartmentTruthBlock()+buildLoreContextForDM()` 的全量拼接
  - 替换为：`RAG 检索召回的 lore facts block`
- dynamic suffix 组装处插入 `RagLoreFactsBlock`

目标：在不改 JSON 契约与 SSE 流的前提下，显著降低每回合 prompt 体积，并实现动态更新。

### 第三步：逐步废弃大块前端世界观硬编码

- registry 仅保留 bootstrap seed/fallback
- 前端页面不再承担事实源职责：
  - 仍可保留展示所需的裁剪数据（避免大模型 prompt 与 UI 展示耦合）
  - 图鉴/任务等只从 store 获取“可展示裁剪后”内容

目标：彻底把事实源切到服务端知识层。

## 7. 两种实现方案对比（可执行性与风险）

### 方案 A（推荐）：复用现有 `vc_world_fact` / `vc_user_fact` 作为事实源

做法：

- registry bootstrap seed：把 CoreCanon facts 写入 `vc_world_fact`（通过新增元数据列或 tags 区分事实类型）
- consensus pipeline：继续写入 `vc_world_fact`，作为 SharedPublicLore
- `vc_user_fact`：作为 UserPrivateLore
- 在 PostgreSQL 层实现检索所需元数据（fact_type/tags/是否核心锚点等），并扩展检索查询

优点：

- 仓库已具备 pgvector + ivfflat + `world_revision` 与热冷 compaction 机制
- 能与现有 semantic cache/世界版本失效思路对齐
- 最小新增基础设施：更符合 4C8G 成本与稳定性要求

缺点/风险：

- 单表机制需要严格区分“核心锚点 CoreCanon”与“可压缩/可归档的热事实”
- compaction 策略必须排除 CoreCanon，否则会造成 prompt 注入缺失

### 方案 B：新增独立世界知识表（`wk_*`），把现有 `vc_*` 限定为候选/用户知识管道

做法：

- 新建 `wk_corecanon_facts` / `wk_public_lore_facts` / `wk_user_private_facts` 等表
- embedding、索引与检索预算在新表中管理
- `vc_*` 体系只用于用户候选/审核/共识晋升与缓存

优点：

- 类型隔离最干净：核心锚点的清理策略可以与共享事实分开
- 更利于后续演进与可观测性

缺点/风险：

- 迁移成本更高：需要新增表、索引、embedding 写入与同步逻辑
- 需要更多维护面，且在“最小骨架准备”阶段不经济

推荐结论：

在当前仓库已实现向量存储与 world_revision 的前提下，方案 A 更符合“先审计、设计与最小骨架准备”的目标与约束。

## 8. 重构边界清单（写入文档）

### 8.1 本阶段不动的文件

- 不动 `/api/chat` 主链路与 SSE/JSON 契约：
  - `src/app/api/chat/route.ts`（流式链路、JSON 字段兼容、流阶段机）
- 不动单一主 store：
  - `src/store/useGameStore.ts`
- 不推翻 ai/governance 分层缓存：
  - `src/lib/ai/governance/preflightCache.ts`
  - `src/lib/ai/governance/responseCache.ts`
- 不改变现有 KG 管道行为（只做对接）：
  - `src/lib/kg/*`

### 8.2 后续会改的文件（第 2 步接入 RAG 注入时）

- `src/lib/playRealtime/playerChatSystemPrompt.ts`
  - 把稳定前缀中的“大段 lore 全量拼接”拆分为：
    - 极少核心锚点摘要（保持 stable）
    - 动态 RAG lore block（插入 dynamic suffix）
- 新增检索注入调用点：
  - 通常位于 `/api/chat` 构建 system prompt 的位置（但本阶段不做）

### 8.3 必须保持兼容的 JSON 契约（`/api/chat`）

以下字段在本阶段保持完全兼容，未来接入 prompt 注入时也不能随意改名或新增破坏性字段（除非同步全部消费方）：

- `is_action_legal`
- `sanity_damage`
- `narrative`
- `is_death`
- `consumes_time`
- `consumed_items`
- `codex_updates`
- `awarded_items`
- `awarded_warehouse_items`
- `options`
- `currency_change`
- `new_tasks`
- `task_updates`
- `player_location`
- `npc_location_updates`
- `bgm_track`

### 8.4 必须通过 seed/bootstrap 导入数据库的内容

- CoreCanon facts：
  - 合规与 JSON-only 协议摘要
  - 实体/位置/ID 白名单约束摘要
  - 禁止新增实体/规则的底层约束摘要
- 以及为 RAG 注入准备的事实集合：
  - NPC 固定 lore 与 immutable relationships
  - 诡异 killingRule/survivalMethod/弱点
  - 守则规则块
  - 地点/房间节点
  - 道具/物品描述与触发条件裁剪片段
  - 暗月/出口等事件规则

### 8.5 重构边界总览（四条铁律对照）

- 本阶段不动：`src/app/api/chat/route.ts`、`src/store/useGameStore.ts`、`src/lib/ai/governance/preflightCache.ts`、`src/lib/ai/governance/responseCache.ts`、`src/lib/kg/*`
- 后续会改：`src/lib/playRealtime/playerChatSystemPrompt.ts`（把全量稳定 lore 切为“极少核心锚点 + 动态 RAG 注入”）
- JSON 契约必须保持兼容：`/api/chat` 返回字段集合与语义不变（`is_action_legal`、`sanity_damage`、`narrative`、`is_death`、`consumes_time`、`consumed_items`、`codex_updates`、`awarded_items`、`awarded_warehouse_items`、`options`、`currency_change`、`new_tasks`、`task_updates`、`player_location`、`npc_location_updates`、`bgm_track`）
- 必须通过 seed/bootstrap 导入 DB：CoreCanon 事实集合与用于检索注入的实体/规则/地点/道具等 facts（registry 不再作为运行时事实源）

## 9. 模块落位规划（配合最小骨架）

相关模块现已存在并承担运行时职责，下列目录用于说明模块边界与落位：

- `src/lib/worldKnowledge/types.ts`
- `src/lib/worldKnowledge/constants.ts`
- `src/lib/worldKnowledge/bootstrap/`
- `src/lib/worldKnowledge/retrieval/`
- `src/lib/worldKnowledge/cache/`
- `src/lib/worldKnowledge/ingestion/`
- `src/lib/worldKnowledge/runtime/`
- `src/lib/worldKnowledge/admin/`

## 10. 第三阶段检索时序与缓存策略（新增）

### 10.1 检索时序（服务端）

1. QueryPlanner 从输入提取实体/地点/规则线索并生成 query fingerprint。  
2. L0 request-scope memo 先查（同请求内避免重复检索）。  
3. L1 Redis 读取 lore packet（按 scope/user/session/location/entities 复合 key）。  
4. L1 miss 后进入 L2 PostgreSQL：exact > tag > FTS > vector adapter（可降级 no-op）。  
5. 混合结果重排后按 tokenBudget/charBudget 裁剪，生成 `compactPromptText`。  
6. 写回 Redis（按风险与 scope 决定 TTL），再返回给 runtime 门面。  

### 10.2 缓存键设计

- LorePacket：  
  `vc:wk:v{version}:packet:{taskType}:{scope}:{user}:{session}:{fingerprint}:{location}:{entitiesHash}`
- Entity snapshot：  
  `vc:wk:v{version}:entity:{code}`
- 设计要点：  
  - 必带 `version`（可演进）  
  - 必带 `scope/user/session`（隔离私有数据）  
  - 必带 `location/entitiesHash`（保证场景相关稳定命中）  

### 10.3 TTL 分层策略（4C8G 单机）

- `core/shared`：长 TTL（300-900s）
- `user/session/private`：短 TTL（60-180s）
- 冲突/高风险事实：短 TTL（约 45s）或跳过长缓存

### 10.4 Token 节约策略

- 不再把完整 registry 大段文本塞入动态 prompt。  
- 检索后只注入 `compactPromptText`，每条事实截断并结构化输出。  
- 通过 `tokenBudget -> charBudget` 进行硬裁剪，优先保留核心锚点与场景相关事实。  

### 10.5 Redis 与 PostgreSQL 职责边界

- PostgreSQL：事实源 + 检索主引擎（exact/tag/FTS，向量接口可降级）。  
- Redis：热缓存层（lore packet / entity snapshot / prompt fragment）。  
- ai/governance 现有 preflight/response cache 保持原样；世界知识缓存层位于其下游，不替代它们。

## 11. 第四阶段：Prompt 从静态大块切换到动态注入

### 11.1 稳定前缀与动态注入边界

- 稳定前缀只保留不可替代铁律：
  - 合规红线
  - JSON 契约
  - 叙事风格与关键机制
  - 极少量核心世界约束
- 大段世界细节全部迁移为运行时动态注入：
  - NPC fixed lore / immutable relationships
  - 详细地点、掉落映射、世界真相长段
  - 图鉴真名与场景细节清单

### 11.2 注入顺序（/api/chat）

1. 先完成 `memoryBlock/playerContext/controlAugmentation`。  
2. 调 `getRuntimeLore(...)` 获取 `LorePacket`。  
3. 把 `compactPromptText` 拼入 dynamic suffix。  
4. 再 compose system messages，进入主模型流式链路。  

### 11.3 失败降级策略

- 首选：DB + world retrieval cache
- 失败或无结果：registry bootstrap facts 摘要兜底
- 保证：即使检索失败也不破坏 JSON 契约/SSE 终帧

### 11.4 观测指标（后端）

- `loreRetrievalLatencyMs`
- `loreCacheHit`
- `loreSourceCount`
- `loreTokenEstimate`
- `loreFallbackPath`（none/db_partial/registry）

## 12. 第五阶段：玩家驱动知识写回（私有/共享候选/会话）

### 12.1 事实提取规则

- 提取入口：`extractFactsFromTurn(...)`，统一收敛以下来源：
  - `latestUserInput`
  - `dmRecord.narrative`
  - `codex_updates`
  - `player_location` / `npc_location_updates`
  - `new_tasks` / `task_updates`
  - `awarded_items` / `awarded_warehouse_items`
  - session memory 摘要与规则命中信息
- 每回合设置提取上限（默认 10-12 条），并在写回前做 normalized 去重，避免事实膨胀。

### 12.2 分流与门控策略

- `classifyFactScope(...)` 将事实分流为：
  - `user_private`：玩家视角、个体经历，允许立即写回；
  - `session_fact`：位置/局面状态，按会话短周期生效；
  - `shared_candidate`：系统高置信事实，进入候选审核链；
  - `core_protected`：保留给不可覆写锚点（回合写回禁止覆盖）。
- 模糊叙述（如“好像/可能/我猜”）默认降级为私有，不直接升级为共享候选。

### 12.3 冲突检测策略

- `detectConflicts(...)` 对每条分流结果做冲突判定：
  - 与 Core Canon 冲突：禁止直入共享；
  - 与已验证共享事实冲突：进入 review 队列，不直写共享；
  - 与私有历史冲突：允许写新版本，并标记 `superseded_private`。
- 冲突决策输出：`allow_private` / `enqueue_review` / `reject_shared_direct`。

### 12.4 持久化与 KG 双轨协同

- `persistTurnFacts(...)` 执行顺序：
  1) 提取 -> 分流 -> 冲突检测；  
  2) `allow_private` 写入 `world_player_facts`，并投影到 `world_entities + world_knowledge_chunks`；  
  3) `enqueue_review` 通过 `kg/ingest` 进入 `vc_world_candidate -> janitor -> consensus`；  
  4) `reject_shared_direct` 仅审计，不直入共享事实层。  
- `mergeKnowledgeChunk(...)` 负责去重合并、检索键生成与 session/user 隔离键规范。
- embedding 写回采用非阻塞策略：新 chunk 先标记 `embedding_status='pending'`，不阻塞 `/api/chat`。

### 12.5 主链路接入与 RAG 联动

- 接入点：`/api/chat` 的 `runStreamFinalHooks()` 在 `__VERSECRAFT_FINAL__` 输出后以 `void` 异步触发写回，不改变 SSE framing 与 JSON 契约。
- 检索侧新增 session 隔离：`visibility_scope='session'` 时必须同时匹配 `owner_user_id` 与 `retrieval_key LIKE 'session:{sessionId}:%'`，防止跨会话串读。
- 共享候选默认不直接进入主 lore packet，只有经既有 KG 审核链通过后才可晋升共享事实。

## 13. 第六阶段：运营化收尾（管理、观测、预算、回归）

### 13.1 管理 API（最小可用）

- 新增 world knowledge 管理接口（admin shadow 鉴权）：  
  - `GET /api/admin/world-knowledge/entities`  
  - `GET /api/admin/world-knowledge/entities/:id`  
  - `GET /api/admin/world-knowledge/candidates`  
  - `POST /api/admin/world-knowledge/candidates/:id/review`  
  - `GET /api/admin/world-knowledge/retrieval-stats`

### 13.2 结构化观测字段

- worldKnowledge 相关指标进入 telemetry/observability 结构化字段：  
  - `retrievalLatencyMs` / `retrievalCacheHit`  
  - `retrievalSourceCounts` / `retrievalScopeCounts`  
  - `lorePacketChars` / `lorePacketTokenEstimate`  
  - `fallbackRegistryUsed`  
  - `factIngestionCount` / `factConflictCount` / `privateFactHitCount`

### 13.3 预算与降级守卫

- 守卫常量：最大召回条数、最大 lore packet 字符数、最大写回条数、检索超时阈值。  
- `getRuntimeLore` 增加 retrieval timeout，超时自动走 fallback。  
- cache 层在 Redis 不可用时可返回短暂 stale fallback，保证高并发热点 key 行为可预测。

### 13.4 前端边界收口

- 前端 store 不再直接依赖大体量 `NPC_SOCIAL_GRAPH` 对象，改为通过 `registry/runtimeBoundary.ts` 获取最小位置种子。  
- 约束继续保持：registry 在新体系中仅承担 bootstrap/fallback/少量 UI 常量，不作为运行时主事实源。

