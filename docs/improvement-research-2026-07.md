# VerseCraft 技术与玩法改良方向调研报告

调研日期：2026-07-01
调研方法：① 2 个只读子代理对代码库做逐文件核查（玩法系统现状 / 技术架构现状），共读取 90+ 源文件；② 22 次独立网络检索，覆盖商业 AI 叙事产品、学术研究、中国市场（剧本杀 + AI 陪伴 + 监管）、技术模式、恐怖游戏设计先例、留存商业化六个方向；③ 对 2 条最关键、最影响优先级判断的结论做了一手来源核验（见第五节）。全文引用均可在第六节找到原始链接。

---

## 摘要

1. **最高优先级、时效性最强**：中国网信办已于 2026-04-10 发布《人工智能拟人化互动服务管理暂行办法》，直接约束"虚拟亲密关系服务"。VerseCraft 现有 `romanceStage`（none/hint/bonded/committed）+ `affection`/`desire` 关系轴大概率落入监管范围，建议作为独立事项优先核查，重要性高于常规产品迭代。
2. **代码级核查确认一个真实的状态一致性 bug**：NPC 关系数值存在两条并行写入语义——`mergeCodex`（`src/store/useGameStore.ts:1842-1900`，处理 AI 每回合下发的 `relationship_updates`）是**覆盖写、无裁剪**；`applyTaskRelationshipConsequencesToCodex`（同文件 :906-939）是**累加写、`clampRelation` 裁剪至 [-100,100]**（:901-904）。同一批字段（favorability/trust/fear/debt/affection/desire）两套语义并存，违反 CLAUDE.md 自己强调的"state delta first"原则，且理论上 AI 一次异常输出就能把关系值写到裁剪范围外。已直接读代码确认，非转述。
3. **技术上性价比最高的改造**：把"纯 prompt 文字指令 JSON 输出"升级为 provider 级 schema 约束。OpenAI Structured Outputs 官方数据显示，从"纯 prompting"到"strict schema + 约束解码"，复杂 schema 遵循率从 gpt-4-0613 的 <40% 提升到 gpt-4o-2024-08-06 的 100%。VerseCraft 当前 `PLAYER_CHAT` 只用 `responseFormatJsonObject: true`（JSON 语法层面），字段/类型约束全靠 system prompt 文字描述，属于已被验证过时的做法。
4. **世界知识检索的"向量检索"目前是未启用的占位符**：`vectorSearch.ts` 直接 `return []`，真实检索靠 SQL 结构化查询 + 字符串 `.includes()` + Postgres 全文检索 `ts_rank`，rerank 也是字符串包含打分而非向量相似度。这与文档暗示的能力有落差，是内容规模继续增长后一致性风险的主要来源。
5. **玩法上最值得做的一件事**：把理智值从"纯粹的死亡倒计时数值"改造为有中间状态效应的机制（参考 Darkest Dungeon 的 Stress/Affliction、Call of Cthulhu 的临时疯狂规则），且可以和已有的 canon/reveal 分级系统天然联动（理智越低解锁越多"不该看见"的真相），是少写代码、体验提升明显的方向。

---

## 一、代码库现状核查（2026-07，只读子代理逐文件核查所得）

### 1.1 玩法系统现状

| 系统 | 现状 | 关键文件 |
|---|---|---|
| 图鉴/Codex | 三层混合：静态 registry 骨架（20 NPC + 8 异常体）+ AI 运行时写入 `codex_updates` + `codexAutoCapture.ts` 扫描 narrative 自动补发。数据库仅存 `codexFirstViewDone` 标志位，图鉴内容本身不落库 | `src/lib/registry/npcs.ts`、`src/lib/registry/anomalies.ts`、`src/lib/registry/codexAutoCapture.ts`、`src/db/schema.ts:294` |
| 任务系统 | `GameTaskV2` 40+ 字段，含大量叙事元数据；状态机 5 态（active/completed/failed/hidden/available）叠加独立 6 态 `grantState`；分支靠 `hiddenTriggerConditions`+`worldConsequences` 串联而非同任务内建模；**`failed` 状态存在但无服务端超时/心跳自动判定，完全依赖 AI 主动声明** | `src/lib/tasks/taskV2.ts:28-45,72-177,731-1076` |
| NPC 关系 | 6 轴数值（favorability/trust/fear/debt/affection/desire）+ `romanceStage`+`betrayalFlags`，非单一数值。**但写入路径不一致**（见摘要第 2 条，已一手验证）。无记忆衰减机制。UI 仅输出 4 档文字标签，不展示数值 | `src/store/useGameStore.ts:901-939,1842-1900`；`src/app/play/page.tsx:3995-4027` |
| 道具/仓库/货币 | `Item`（行囊）/`WarehouseItem`（仓库）/`Weapon`（装备）三套独立 interface；字母品级 `S/A/B/C/D`；装备系统较深（词条、限时灌注、稳定性、污染度，随小时 tick 演化，`statBonus` 真实参与判定）；仓库物品无 tier/属性，行囊与仓库无堆叠数量字段；Registry 规模 items 81 件、warehouse 60 件 | `src/lib/registry/types.ts:60-114,225-249,318-403` |
| 位置/地图 | **不存在地图可视化**，全仓库无坐标/SVG/canvas，位置为纯字符串（如 `B1_SafeZone`），UI 唯一入口是文本切换 | `src/features/play/stream/types.ts:172`、`MobileCharacterPanel.tsx` |
| 理智值/死亡/结局 | `sanity_damage` 有裁剪与恢复上限基础实现，无自动时间回复、无中间状态效应，`sanity<=0` 直接死亡；**已有完整多结局系统**：6 种结局（death/doom/true_escape/costly_escape/false_escape/abandon）+ S-E 六档评级，`/settlement` 展示死因、关键选择回顾、NPC 后日谈；独立 `mainThreatByFloor` 相位状态机（idle→active→suppressed/breached），**有意不做进度条**（prompt 明确要求 AI 不要输出进度条式表达，属于设计选择而非缺失） | `src/lib/sanityDamage.ts`、`src/lib/endings/types.ts:3-9`、`src/app/settlement/page.tsx` |
| BGM/音效 | `bgm_track` 服务端规则引擎按优先级覆盖（死亡>Boss>战斗>理智崩溃>...>模型建议排第 8），16 首本地固定 MP3，无 SFX 文件、"音效"是 Web Audio 振荡器实时合成 | `src/lib/.../bgmRules.ts:214`、`audioEngine.ts` |
| 世界知识检索 | **非向量语义检索**：SQL 结构化查询 + tag JOIN + Postgres 全文检索 `ts_rank` + 字符串包含打分 rerank；`vectorSearch.ts` 直接 `return []`，代码注释自称"phase-3 占位符，运行时 no-op"；`kg/embed.ts` 是本地 FNV-1a 哈希分桶，非语义 embedding。Canon/reveal 分级门禁是真实实现（`revealGate.ts:66-100` 按 rank/truthClass/audience 判断）；NPC 认知边界核心函数 `canActorKnowFact`（`epistemic/guards.ts:22-64`）按 fact.scope 做真实 switch-case 过滤 | `src/lib/worldKnowledge/*`、`src/lib/epistemic/guards.ts` |
| 内容规模 | Registry 约 80 文件、11,558 行代码，含 6 个"深度正典"NPC、7 层楼独立 lore、6 条根真相、9 条世界秩序正典——**非早期原型规模**，属已投入相当开发量的中型叙事内容库 | `src/lib/registry/*` |
| 代码质量 | 未发现大段世界观/剧情文案硬编码进 JSX（符合 CLAUDE.md 要求）；`any`/`as unknown as`/`as any` 合计 616 处，集中在 `useGameStore.ts`(64)、`api/chat/route.ts`(62)、`taskV2.ts`(36)；单测 343 个 + e2e 28 个，但 CLAUDE.md 指定的 12 个高风险文件中 3 个缺运行时单测：`route.ts`（仅静态字符串契约测试）、`play/page.tsx`（仅测辅助模块）、`HydrationProvider.tsx`（无测试证据）；`schema.ts` 全仓库无单测证据 | 全仓库 Grep 统计 |

### 1.2 技术架构现状

| 模块 | 现状 | 关键文件 |
|---|---|---|
| Turn Engine | 真实流水线（`applyNpcConsistencyPostGeneration`→`resolveDmTurn`→`validateNarrative`→`commitTurn`→终帧），运行时确认 `nodejs`，keys_missing 降级路径可复现；**SSE 常量存在双实现**（`turnEngine/sse.ts` 与 `narrativeEngine/streamFrames.ts` 字面量相同但独立定义，route.ts 只 import 后者，前者是历史遗留平行实现）；route.ts 有 2 处 `TODO(phase-3)`，对应文档自己标注的 5 个 transitional 缺口（**含 EpistemicFilter 未回接 prompt 组装**） | `src/app/api/chat/route.ts:2064,3062,3346,3439,3577,3795,4074,4626` |
| AI 服务层 | 结构化输出=纯 system prompt 文字指令+`responseFormatJsonObject:true`（仅保证合法 JSON，不保证 schema），真正字段校验在下游 `normalizePlayerDmJson`/`validateNarrative`；重试/降级分层清晰：`resilientFetch` 对 429/503/502/408 指数退避，`PLAYER_CHAT` 最多 1 次重试，角色链 main→control→enhance→reasoner 降级，有熔断，`TASK_ROLE_FORBIDDEN.PLAYER_CHAT`强制排除 reasoner/enhance；无 vendor 级 prompt caching，响应级 KV 缓存只覆盖 3 个离线任务，`PLAYER_CHAT` 每次真实调用 | `src/lib/ai/tasks/taskPolicy.ts:69,221,245-249,351-400`、`src/lib/ai/resilience/fetchWithRetry.ts:31-94` |
| 测试/评估基础设施 | 343 单测文件（36149 行）+ 29 e2e（6376 行），CI 分 5 job；**但"评估"脚本全部是纯规则判断，无 LLM-as-judge**：`chatQualityRubric.ts` 用 httpStatus/字符数区间/正则黑名单/固定延迟预算做布尔判断；`eval-npc-consistency` mock/live 两种模式执行完全相同的本地规则计算，不发 HTTP 请求；`eval:npc-consistency` 从未被任何 CI workflow 引用，是孤立脚本；`live-chat-perf` 仅 schedule/手动触发，常规 PR 不跑真实模型 | `src/lib/evals/chatQualityRubric.ts:97-134`、`.github/workflows/ci.yml` |
| World Engine | **真实实现，非占位**：12 信号状态机判断触发→Redis 去重锁+写 `vc_jobs`→`vc-worker.ts` 轮询消费→`runOfflineReasonerTask`（reasoner 角色）→`validateDirectorPlan` 校验（含 agency_risk/spoiler_risk 拒绝）→事务写入。存在"failed-open"设计：`insertDirectorAgendaItems` 失败被 `.catch(()=>{})` 静默吞掉，`saveDirectorState` 用 `void` 不等待失败 | `src/lib/worldEngine/engine.ts:428,438,470` |
| Analytics/可观测性 | `analytics_events` 是真实 append-only 表，`idempotencyKey` 唯一索引+`onConflictDoNothing` 真幂等，7 索引；Admin 是完整可视化 dashboard（`AdminDashboardV2.tsx` 多 Tab），27 个 admin route；**"OTel"可观测性是伪实现**：塞入 `gen_ai.client.token.usage` 等 OTel 键名，但无真正 OTel SDK/collector，靠内存环形缓冲区（`observabilityRing.ts`，MAX=120，进程重启即丢），无跨请求 traceId | `src/db/schema.ts:386-433`、`observabilityRing.ts` |
| 文档现状 | docs/ 共 122（现核实为 114）份 md，约 65 份未过时，约 30 份部分过时。`environment.md` 部分过时（写"容器启动执行 `scripts/migrate.js`"，该文件不存在，真实逻辑在 `src/instrumentation.ts` 的 `ensureRuntimeSchema()`）；`deployment-coolify.md` 部分过时（写默认镜像 `node:20-alpine`，Dockerfile 实际是 `node:22-alpine`） | `docs/environment.md`、`docs/deployment-coolify.md` |
| 部署/CI | Next standalone + 三阶段 Dockerfile（`node:22-alpine` 非 root）+ Coolify，内置 `HEALTHCHECK`，`start-production.mjs` 默认执行迁移失败即退出，`/api/health` 三态健康检查，有自建 `autoops/rollback.mjs` 回滚机制；**风险**：`ci.yml` 全文无 `docker build` 步骤，Dockerfile 可构建性从未在 CI 验证；合并 main 后仅当 commit message 含 `[auto-ops]` 才触发生产验证，普通 PR 合并不自动验证生产 `/api/health` | `.github/workflows/ci.yml`、`Dockerfile` |
| 数据库 schema | 42 张表、约 110 处索引；**外键缺失**（`npcMemoryEntries.npcId`、`storyEvents.sessionId/worldId/chapterId` 均无 `references()`，全项目无 `sessions` 主表）；零 `pgEnum` 使用，20+ 有限取值字段用裸 varchar；jsonb+`$type<>()` 使用正确（亮点）；`worldKnowledgeChunks.contentTsv/embeddingVector` 运行时由 `ensureSchema.ts` 建为 tsvector/vector(256)，但 schema.ts 里降级为 text 以便编译，**造成 schema 与真实 DB 结构不一致**；`actorSessions`/`userSessions`、`actorDaily*`/`userDaily*`/`guestDaily*` 三层共 6 张结构近似表并存（注释承认是未收敛的过渡态） | `src/db/schema.ts`（1172 行） |

---

## 二、行业最佳实践调研

### 2.1 商业 AI 叙事/互动小说产品

**AI Dungeon（Latitude）**：其 Memory System 由 Auto Summarization + Memory Bank 组成，用 summarization 模型+embedding+向量做"压缩-存储-检索"，构造发给模型的上下文时融合 story text + AI Instructions + Plot Essentials（原 Memory）+ Author's Note + 相关 Story Cards；2026-02 仍在迭代（"2x Context + 重新设计的 Memory System"）。2021 年曾因 NSFW/儿童安全内容审核缺失爆出重大丑闻，是行业公认的反面案例。[Latitude 官方博客](https://latitude.io/blog/how-the-new-memory-system-works)、[AI Dungeon 帮助中心](https://help.aidungeon.com/faq/the-memory-system)

**Character.AI**：194M 月访问量级别的产品，记忆策略是"短期对话流畅优先于长期记忆"，官方 Memory 功能约 400 字符/角色的记忆盒+置顶消息，角色定义超过约 3200 字符后开始不可靠，长对话存在"context rot"（早期设定随上下文窗口滚出而丢失，导致人格漂移）。核心矛盾是推理成本随上下文长度扩大，在其价格点上跑满 128K token 不现实。[Character.AI 官方博客](https://blog.character.ai/memory/)（以上"400 字符/3200 字符/turn 21 重置"等具体数字来自第三方评测博客，非官方一手数据，置信度中等，建议仅作方向参考）

**Hidden Door**：Northzone 领投 $2M pre-seed，后由 Makers Fund 领投 $7M 种子轮，定位"AI dungeon master"，把任意 IP 小说转成社交角色扮演体验（已有《傲慢与偏见》《绿野仙踪》及 The Crow 等授权内容），核心叙事者被官方直接称为"AI dungeon master"。[TechCrunch](https://techcrunch.com/2022/10/27/hidden-door-wants-to-turn-fiction-into-immersive-roleplaying-experiences/)、[Businesswire](https://www.businesswire.com/news/home/20220316005334/en/Hidden-Door-Launches-AI-Game-Platform-to-Build-the-Narrative-Multiverse)

**Inworld AI / convai**：均做"NPC 知识边界"产品化——Inworld 让开发者"populate a knowledge database that characters may or may not have access to"，角色响应基于 live game state 实时驱动；convai 用"Knowledge Bank"存角色背景/世界观/职责，明确定位是解决 LLM 幻觉问题。两者都原生支持 Unity/Unreal SDK。这与 VerseCraft 已有的 `canActorKnowFact` 认知边界过滤理念一致，说明该设计方向本身是对的，问题在于"检索底座"（见 1.1 世界知识现状）。[NVIDIA Blog: Inworld](https://blogs.nvidia.com/blog/generative-ai-npcs/)、[Convai 知识库指南](https://convai.com/blog/building-ai-characters-knowledge-bank-with-convai)

**Nvidia ACE / Ubisoft Ghostwriter**：ACE 是"最多 4 个 AI 模型协同"的数字人管线（ASR→对话生成→动画同步），可云端/本地混合推理；Ghostwriter 定位克制——只生成 NPC "barks"（路人闲聊短句）首稿供编剧筛选编辑，用人工选择结果做偏好学习迭代，明确不是替代编剧。两者共同点：AI 负责"体力活"分层，人/规则把关最终产出，而非端到端自由生成。[NVIDIA ACE](https://blogs.nvidia.com/blog/ai-decoded-ace-microservices-digital-humans/)、[Ubisoft 官方公告](https://news.ubisoft.com/en-us/article/7Cm07zbBGy4Xml6WgYi25d/the-convergence-of-ai-and-creativity-introducing-ghostwriter)

**Fable Studio / Showrunner**：SHOW-1 用 LLM+扩散模型+"多 agent 模拟"生成完整动画剧集（角色历史/目标/情绪作为模拟数据点驱动场景一致性），2023 年论文发布即用该技术生成过未授权南方公园剧集引发讨论，2025 年获 Amazon Alexa Fund 投资。[Showrunner 论文站点](https://fablestudio.github.io/showrunner-agents/)、[Variety](https://variety.com/2025/digital/news/netflix-of-ai-amazon-invests-fable-showrunner-launch-1236471989/)

### 2.2 中国市场：剧本杀 + AI 陪伴 + 监管环境

**剧本杀行业**：核心是"信息不对称"——每个玩家拿到不同角色本，主持人(DM)负责读本、控场、分发线索、揭晓复盘；线索分三类（现场线索/人物线索/事件传闻），设计时需明确每条线索能推出什么结论；叙事上流行"蒙太奇"式结构，让玩家在不同角色视角/时空间切换以强化悬疑感。这套"分幕控制信息量+主持人居中调度"的方法论与 VerseCraft 的 DM-turn-engine 理念高度同构，值得作为叙事节奏设计的对照系统。[知乎：如何做好一个专业的剧本杀主持人](https://zhuanlan.zhihu.com/p/89039180)、[indienova：AI 剧本杀叙事方式探索](https://indienova.com/indie-game-development/exploration-of-narrative-approaches-in-ai-driven-murder-mystery-games/)

**星野（MiniMax）**：产品机制上做"重说/回溯/记忆/重启/评价/事件簿"六个用户可控杠杆；"星念"系统把每个用户与角色的独特互动记忆具象化为可下载、可设为背景、可在交易市场流通的"记忆相片"——这是把"记忆"从抽象数值变成可感知资产的一个值得借鉴的设计。2024H1 下载量约 900 万、6 月 DAU 近 50 万，是同类中国产品第一梯队。[人人都是产品经理：为什么 AI 陪伴产品都想抄星野](https://www.woshipm.com/evaluating/5946439.html)

**MiniMax/Talkie 商业数据**（多来源交叉验证，置信度较高）：2025 年总营收 7900 万美元，同比增长 158.9%，超 70% 来自海外；Talkie/星野月活从 2023 年 310 万增长到 2025 年 9 月的 2760 万，付费用户 177.16 万，ARPPU 从 6 美元涨到 15 美元；变现靠订阅+虚拟道具内购+广告三线并行。[Sacra](https://sacra.com/c/minimax/)、[MiniMax 官方财报新闻](https://www.minimax.io/news/minimax-global-announces-full-year-2025-financial-results)、[S&P Global](https://www.spglobal.com/market-intelligence/en/news-insights/research/2026/04/minimax-revenue-seen-rising-to-usd219m-in-2026-reaching-usd6b-by-2030)

**未定事件簿（叠纸）**：非 AI 生成但结构范式可借鉴——好感度提升解锁"思绪"剧情，除主线外叠加线索收集、庭审等强互动系统提高可玩性，剧情选择做本土化设计（饭圈文化等）以增强代入感。[萌娘百科](https://zh.moegirl.org.cn/zh-hans/%E6%9C%AA%E5%AE%9A%E4%BA%8B%E4%BB%B6%E7%B0%BF)

**⚠️ 中国监管环境（重要，时效性强）**：国家网信办 2025-12-27 就《人工智能拟人化互动服务管理暂行办法》公开征求意见，正式文本于 2026-04-10 发布。核心条款：服务提供者**不得向未成年人提供虚拟亲属、虚拟伴侣等虚拟亲密关系服务**；向不满 14 周岁未成年人提供其他拟人化互动服务需取得监护人同意；须建立未成年人模式（时长限制、定期提醒），支持监护人接收风险提醒、屏蔽特定角色、限制充值消费。2025 年全年新增 446 款生成式 AI 服务完成备案。[国家网信办原文](https://www.cac.gov.cn/2026-04/10/c_1777558395078289.htm)、[专家解读](https://www.cac.gov.cn/2025-12/28/c_1768662848000498.htm)、[英文翻译](https://www.chinalawtranslate.com/human-like-ai/)（具体生效日期与执行细则建议以官方原文与法务意见为准，本报告仅做产品侧风险提示）

### 2.3 学术 AI 叙事/Agent 研究

**Stanford Generative Agents（Smallville，Park et al., UIST 2023 最佳论文）**：架构三支柱——① Memory Stream：按时间顺序记录每条 observation/plan/reflection 的档案库；② Reflection：周期性从近期记忆抽象出更高层次的"感悟"；③ Planning：把 reflection 结论+当前环境转成分层的每日计划并递归分解为具体行为。25 个 agent 在无显式指令下自发组织了情人节派对并通过社交网络扩散邀请。这套"打分函数（重要性/时近性/相关性）+ 定期反思+分层规划"是目前长程记忆一致性问题最被广泛引用的解法，后续多数长期运行 agent 框架的记忆设计都可追溯到这里。[Subodh Jena 技术解读](https://www.subodhjena.com/blog/generative-agents-memory-stanford)、[ACM 论文全文](https://dl.acm.org/doi/fullHtml/10.1145/3586183.3606763)

**Façade（Mateas & Stern）**：用 ABL（A Behavior Language，基于 Hap 的反应式规划语言）编写角色行为，"Drama Manager"依据叙事状态、玩家选择、角色情绪动态挑选"beat"（对话/动作片段）来调度整体节奏。这是"叙事节奏由中央调度器主动管理，而非纯被动响应玩家输入"的经典先例，与 VerseCraft turn engine 里 control preflight 的角色定位相通。[AAAI 论文](https://ojs.aaai.org/index.php/AIIDE/article/view/18722)

**Versu（Richard Evans，前 Sims 3 AI 负责人 + Emily Short）**：核心概念是"social practice"（社会实践脚本）——虚构角色和真人一样，行为遵循所处社交情境的既定规则，以此协调多个自主 agent 而不显得混乱。项目 2014 年被 Linden Lab 取消，是"高概念叙事 AI 引擎难以商业化落地"的一个真实前车之鉴。[Versu 官网](https://versu.com/about/)、[Emily Short 博客](https://emshort.blog/2013/02/14/introducing-versu/)

**Voyager（NVIDIA）**：三件套——自动课程（最大化探索）、不断增长的技能库（可执行代码形式存储/检索复杂行为）、迭代式 prompting（吸收环境反馈/报错/自我验证）。技能以代码而非底层动作表示，可组合、可解释、可跨世界迁移复用，这对"AI 持续生成新内容而不遗忘旧能力"有直接借鉴意义。[Voyager 项目页](https://voyager.minedojo.org/)、[arXiv](https://arxiv.org/abs/2305.16291)

**Reflexion**：不更新模型权重，而是把环境反馈转成"语言化"的自我反思文本存入episodic memory，作为下一轮决策的语义梯度信号。轻量、不需要微调，适合用来加强"叙事一致性自我校验"这类场景——VerseCraft 现有 `validateNarrative.ts` 是纯规则式且明确"不做二次 AI 调用"，Reflexion 提供了一个"AI 自查"的备选思路（但需权衡延迟预算）。[arXiv](https://arxiv.org/pdf/2303.11366)

**NPC 认知/Theory of Mind 研究现状**：2024-2025 年研究显示这仍是不成熟领域——评测普遍只测单一维度、缺乏构念效度、多用第三人称静态场景而非动态互动，MindGames 等基准尝试用动态认知模态逻辑测试 LLM 的心智理论能力。这说明 VerseCraft 现有基于规则的 `canActorKnowFact` 过滤（而非依赖 LLM 自行推断"NPC 该不该知道"）是当前更稳妥的工程选择，不必急于替换成"更智能"但尚不成熟的 ToM 建模方案。[CMU 博士论文](https://ml.cmu.edu/research/phd-dissertation-pdfs/ioguntol_phd_mld_2025.pdf)、[MindGames](https://arxiv.org/pdf/2305.03353)

### 2.4 技术模式

**LLM 结构化输出可靠性**（一手验证，见第五节）：OpenAI Structured Outputs 用"训练模型理解复杂 schema"+"约束解码（constrained decoding）"两条腿走路。约束解码把 JSON Schema 编译成上下文无关文法（CFG），每采样一个 token 后动态计算哪些 token 合法，把非法 token 的 logit 压到负无穷（即概率归零），从而不是"依赖模型自觉"而是"物理上不可能输出非法内容"。效果：`gpt-4o-2024-08-06` 复杂 schema 遵循率 100%，`gpt-4-0613` 纯 prompting 不到 40%。该功能明确致谢并借鉴了开源的 outlines / jsonformer / guidance / lark 等约束解码库，说明这条技术路线在闭源和开源生态都已成熟，不是厂商专属黑盒。限制：首次遇到新 schema 有预处理延迟（通常<10s）、不兼容 parallel function calling、不支持 Zero Data Retention。[OpenAI 官方博客（已一手核验全文）](https://openai.com/index/introducing-structured-outputs-in-the-api/)

**开源约束解码生态**：grammar-constrained decoding 把结构化生成视为"受约束的生成问题"，通过 lexer-parser 流程逐 token 生成掩码向量，屏蔽不合语法的 token；outlines/guidance/jsonformer 等库是这条路线的代表实现，2025-2026 年仍有大量论文在优化其在大词表、递归 schema 下的效率（如 Pre³ 用确定性下推自动机加速）。[技术详解](https://mbrenndoerfer.com/writing/constrained-decoding-structured-llm-output)

**RAG 用于游戏叙事一致性**：核心价值是让 NPC/剧情内容"跟世界观最新设定保持一致，避免前后矛盾的情节漏洞"，做法是把设计文档/传说资料建索引，动态检索后再生成，好处是不需要重新训练模型、可随时更新知识库。进阶做法包括"episode 级摘要+关键道具追踪"提升长篇一致性，以及用 GraphRAG（知识图谱+检索）替代纯向量检索来提供结构化上下文——这与 VerseCraft 现有的 canon/reveal 分级系统理念相通，说明"补齐真正的向量/图检索"是在已有正确骨架上做加法，而不是推翻重来。[NVIDIA 开发者博客](https://developer.nvidia.com/blog/evolving-ai-powered-game-development-with-retrieval-augmented-generation/)、[SCORE 论文](https://arxiv.org/pdf/2503.23512)

**实时流式 AI 应用的延迟预算**：行业共识——TTFT（首字延迟）是用户真正能感知到的等待，<1s 用户觉得"响应"，>2s 用户开始明显不耐烦；流式输出本身不会让总响应更快，但能让"第一个字"提前出现从而"感觉快"；ChatGPT 等产品常用轻量"过渡语"（如"好的，我来说明一下…"）在真正生成内容前先给出反馈，同时利用这段时间做检索等准备工作；缓存稳定检索结果、去抖动、并行执行独立步骤是常见优化点。这与 VerseCraft CLAUDE.md 自己定的 first visible text p50≤2500ms / p95≤5000ms 预算方向一致，说明现有预算设定是合理的，重点应放在"首字前"的检索/预检环节是否有可并行化的串行浪费。[Redis 工程博客](https://redis.io/blog/streaming-llm-responses/)、[Latitude 延迟优化指南](https://latitude.so/blog/latency-optimization-in-llm-streaming-key-techniques)

**AI 生成内容安全审核**：行业标准做法是"规则方法+ML 分类器+人工复核"多层组合，OpenAI Moderation API 覆盖 hate/harassment/self-harm/sexual/violence 等类目，商业方案通常提供 100+ 细分类目。核心挑战在于"AI 生成内容"本身的审核基准还不成熟（如 UnsafeBench 这类数据集才刚出现），值得关注但不必照抄某一家现成方案。[Wray Castle 概览](https://wraycastle.com/blogs/telecoms-regulation-knowledge-base/ai-content-moderation)

### 2.5 恐怖/悬疑游戏理智机制设计先例

**Darkest Dungeon（Stress/Affliction）**：压力累计到 100 触发"决心检定"，失败进入 8 种性格缺陷之一（恐惧/偏执/自私/自虐/施虐/绝望/非理性/狂喜）；开发者 Chris Bourassa/Tyler Sigman 的设计哲学是"人在压力下会以不同方式崩溃，游戏应该刻意让人觉得不公平"；据分析文章统计缺陷:美德比例约 4:1，映照"多数人在极端压力下会崩溃而非变强"的真实心理学发现。[Game Developer 深度设计解析](https://www.gamedeveloper.com/design/game-design-deep-dive-i-darkest-dungeon-s-i-affliction-system)、[压力机制动态分析](https://nicolaluigidau.wordpress.com/2024/02/06/the-dynamics-of-stress-in-darkest-dungeon/)

**Call of Cthulhu TRPG（Sanity/SAN）**：单次损失 ≥5 点 SAN 即触发临时疯狂判定——1D100 掷骰，结果 ≤ 当前 INT 则完全理解所见并陷入临时疯狂（持续 1D10 小时），期间按"疯狂行为表"演出具体症状，事后可能永久附加恐惧症/狂躁症。这是"数值阈值→掷骰判定→限时状态效应→可能永久后遗症"四段式设计，比 VerseCraft 当前"扣到 0 直接死亡"复杂得多也更有叙事张力。[Chaosium 官方规则 wiki](https://cthulhuwiki.chaosium.com/rules/sanity.html)

**Bloodborne（Insight）**：双重功能设计——既是探索/击杀怪物获得的"禁忌知识"数值，也是猎人梦境里购买道具、召唤联机的通用货币。核心巧思是"知道得越多，世界呈现给你的样子越不同"：教会医生洞察值够高会开始用秘术弓箭攻击、部分敌人会因高洞察触发狂气光环——用机制本身隐喻"知识是双刃剑"的主题，而非单纯惩罚。[TechRaptor 设计解析](https://techraptor.net/gaming/features/bloodborne-insight-interesting-mechanic)、[ResetEra 讨论](https://www.resetera.com/threads/why-is-the-bloodborne-insight-mechanic-so-effective.1339918/)

**Sunless Sea / Fallen London（Terror）**：Terror 值显示在屏幕左上角，靠近文明灯火不易累积，远离陆地会持续增长；首次带着 >50 Terror 回到伦敦触发"噩梦"，记录为可增长的"噩梦之力"故事线，若持续带着 ≥70 Terror 回城噩梦会进一步加剧——这是"数值+持续性叙事后果绑定"的好例子，理智不只是即时判定，还会在世界状态里留下累积印记。[Fallen London Wiki](https://fallenlondon.wiki/wiki/Sunless_Sea)

### 2.6 留存与商业化

AI 陪伴类应用 2025 年活跃且有收入的产品约 337 款（当年新增 128 款，产品目录一年扩张 38%），单次下载收入从 2024 年的 0.52 美元涨到 2025 年的 1.18 美元，但头部 10% 产品拿走了 89% 的品类总收入，集中度很高。留存是行业公认的最大瓶颈：AI 类月度订阅 12 个月留存比传统应用差 36%，首月即占全年取消量的 35%，年度订阅次年续订流失率从 2025 年约 56% 恶化到 2026 年约 72%。主流变现是订阅（分三档：$10-20/月、$30-200/月专业档、$25-60/座位团队档）+ 记忆/人格深度个性化 + 平台安全合规设计，普遍回避广告（担心打断情感沉浸）。[RevenueCat 2026 订阅应用报告](https://www.revenuecat.com/state-of-subscription-apps/)、[AI 陪伴行业报告](https://track360.io/blog/ai-companion-industry-report-market-size-growth-retention-2026)

---

## 三、改良方向与优先级

### 3.0 合规（建议立即处理，优先级高于常规迭代）

VerseCraft 的 `romanceStage`/`affection`/`desire` 机制与 2026-04-10 生效的《人工智能拟人化互动服务管理暂行办法》中"虚拟亲密关系服务"定义高度相关。建议第一步只做**只读合规自查**（见第四节提示词 #1），核实是否已有年龄识别、未成年人模式、监护人同意流程、消费限制等能力，再决定整改范围和优先级。这条不是"锦上添花"式产品优化，而是潜在的经营合规风险，建议单独立项、不与其他技术债混排。

### 3.1 技术改良方向

| 编号 | 方向 | 依据 | 优先级 | 预估工作量 |
|---|---|---|---|---|
| T1 | 修复 NPC 关系数值写入不一致（`mergeCodex` 覆盖无裁剪 vs 任务结算累加+裁剪并存） | 代码级一手核验的真实 bug；违反 CLAUDE.md "state delta first" 原则 | P0 | 小（1-2 个函数） |
| T2 | 结构化输出可靠性升级调研与试点 | OpenAI 数据：纯 prompting <40% vs 约束解码 100%；VerseCraft 现状完全依赖前者 | P0（先 Plan 后 Code） | 中（需先核查网关/供应商支持面） |
| T3 | 补齐 EpistemicFilter 回接 prompt 组装的 phase-3 缺口 | route.ts 现存 `TODO(phase-3)`，文档自己承认的缺口，直接影响"NPC 不该知道的信息"防线是否真正生效 | P0 | 中 |
| T4 | 世界知识检索从字符串匹配升级为真正混合检索（向量+关键词+rerank） | 行业普遍用 RAG/GraphRAG 保证长篇世界观一致性；VerseCraft 向量适配器现为占位符 no-op | P1 | 大（涉及 embedding 选型、索引重建） |
| T5 | eval 脚本诚实化：接入真实 LLM-as-judge 或明确降级为规则检查+补齐 CI 接线 | 现有 "eval" 全部是规则判断，`eval:npc-consistency` 从未接入 CI，与 CLAUDE.md 对"叙事安全 eval"的定位不符 | P1 | 中 |
| T6 | 高风险文件补测试覆盖（route.ts / play/page.tsx / HydrationProvider.tsx / schema.ts） | CLAUDE.md 自定义的 12 个高风险文件中 3 个缺运行时单测，1 个（schema.ts）全仓库无单测证据 | P1 | 中大 |
| T7 | 观测性从伪 OTel 内存环形缓冲区升级为可持久化 trace | 现有 120 条环形缓冲重启即丢，与已经埋入的 OTel 语义键名不匹配，是"看起来有观测性实则没有"的假象 | P2 | 中 |
| T8 | 数据库技术债清理（外键补齐、pgEnum 替换裸 varchar、schema.ts 与真实 DB 结构对齐、收敛三层重复 daily 表） | 代码注释自己承认是"未收敛的过渡态"；随规模增长风险递增 | P2 | 大（需谨慎做迁移，不可仓促） |
| T9 | CI 补齐生产验证闭环（增加 `docker build` 步骤、把生产 `/api/health` 校验从"仅 commit message 触发"改为默认 post-merge gate） | 现状：Dockerfile 可构建性从未在 CI 验证，普通 PR 合并不自动验证生产健康 | P2 | 小中 |

### 3.2 玩法改良方向

| 编号 | 方向 | 依据 | 优先级 | 预估工作量 |
|---|---|---|---|---|
| G1 | 理智值从纯数值升级为"状态效应"系统，并与 canon/reveal 分级联动 | Darkest Dungeon 压力/缺陷设计、Call of Cthulhu 临时疯狂四段式规则、Bloodborne "认知即双刃剑"理念；VerseCraft 已有分级门禁系统，天然可复用 | P1 | 中（数值设计+若干新状态） |
| G2 | NPC 关系补齐"记忆呈现"（叙事化而非数值条），先修复 T1 再考虑衰减机制 | 星野"记忆相片"具象化记忆的做法；Character.AI context rot 反面教材提示"长期一致性体验"是差异化机会点 | P1 | 中 |
| G3 | 任务系统补齐服务端自动失败判定（超时/条件触发），减少对 AI 单次主观声明的依赖 | 内部审计发现的确定性缺口；不直接来自外部最佳实践，但符合"turn compiler 而非自由 agent"的既定架构原则 | P1 | 中 |
| G4 | 理智分档联动叙事视角/用词变化（低理智→不可靠叙事） | Sunless Sea "数值+持续性叙事后果"联动手法 | P2（体验向，非结构性缺口） | 中（需配合 validateNarrative 与 prompt） |
| G5 | 参考剧本杀"分幕控制信息量"方法论，进一步打磨 7 层楼推进节奏与线索揭示节奏 | 剧本杀线索分类方法论（现场/人物/传闻）+ 蒙太奇叙事结构 | P2 | 中（偏内容设计，非纯代码） |
| G6 | 合规约束下的低风险玩家内容沉淀（如"手记"/"羁绊回顾"分享），须先完成 3.0 合规自查 | 星野"事件簿"、AI 陪伴产品留存瓶颈分析（"叙事新鲜感衰减"是主要流失原因之一） | P2（依赖合规结论） | 中大 |

---

## 四、给 Claude Code 的改造提示词

以下提示词按优先级分组，可直接粘贴到 Claude Code 会话开头使用；均已按仓库 CLAUDE.md 的模式约定（Ask/Plan vs Code）标注建议模式，并列出建议先读的文件与验证命令。

### P0（建议立即处理）

**#1 · 合规自查（Plan 模式，不改代码）**

```
用 Plan 模式（只读分析，不改代码）：
核查 VerseCraft 是否落入《人工智能拟人化互动服务管理暂行办法》（2026-04-10 发布）
的监管范围。背景：办法禁止向未成年人提供虚拟亲密关系服务，要求向不满14周岁未成年人
提供其他拟人化互动服务前取得监护人同意，并要求提供未成年人模式（时长限制、定期提醒）、
监护人可屏蔽特定角色/限制充值消费。

请核查：
1. src/lib/registry/types.ts 中 romanceStage/affection/desire 等字段的实际叙事表现
   （是否已构成"虚拟亲密关系服务"）
2. 当前是否有任何年龄识别/实名认证机制（查 auth 相关目录、next-auth 配置）
3. 是否有未成年人模式/时长提醒/监护人接口（大概率没有，请确认）
4. 是否有充值/消费限制机制（查货币系统 currency_change 相关文件）

产出：一份差距清单（已有 vs 缺失），不要修改任何代码。此事项优先级高于常规技术债，
请如实报告风险，不要淡化。
```

**#2 · 修复 NPC 关系数值写入不一致（Code 模式）**

```
Code 模式，最小 diff 修复一个已确认的状态一致性 bug：

src/store/useGameStore.ts 中存在两条并行的 NPC 关系数值写入语义：
- mergeCodex（约 1842-1900 行）处理 AI 每回合下发的 relationship_updates：
  对 favorability/trust/fear/debt/affection/desire 是【覆盖写，无 clampRelation 裁剪】
- applyTaskRelationshipConsequencesToCodex（约 906-939 行）处理任务完成触发的关系变化：
  是【累加写，clampRelation 裁剪至 [-100,100]】（clampRelation 定义在约 901-904 行）

请统一为累加+裁剪语义（除非有明确理由要保留覆盖语义，比如 AI 需要直接"设定"某个值而非
"增量调整"——如果代码里能找到这种意图证据，请先用 Plan 说明再改）。修改范围限定在
useGameStore.ts 的这两个函数及其直接调用方（play/page.tsx 约 3995-4027 行的
relCodexEntries 构造逻辑），不要扩大到其他状态字段。

验证：
- 补一个单测覆盖"覆盖写场景下数值不应超出 [-100,100]"
- pnpm dlx tsx --test <对应 store 测试文件>
- npx eslint .
```

**#3 · 结构化输出可靠性升级（先 Plan 后 Code）**

```
第一步用 Plan 模式调研，不改代码：
VerseCraft 的 PLAYER_CHAT 任务当前只用 responseFormatJsonObject:true（仅保证合法 JSON
语法），字段/类型约束完全靠 system prompt 文字指令（"请严格以JSON格式输出"），
真正校验在下游 normalizePlayerDmJson/validateNarrative。OpenAI 官方数据显示，
纯 prompting 复杂 schema 遵循率不到 40%，而 provider 级约束解码（strict JSON schema /
function calling strict 模式）可达到 100%。

请先核查：
1. src/lib/ai/router/execute.ts 和 src/lib/ai/service.ts 里请求是怎么发给
   one-api/OpenAI 兼容网关的，网关配置里能否传递 response_format:{type:"json_schema",
   strict:true} 或等价的 tool-use strict 参数
2. 当前网关背后实际接入的模型/厂商是否支持这类 provider 级约束（不同厂商支持程度不同，
   必须先核实，不要假设）
3. taskPolicy.ts 里 PLAYER_CHAT 必需字段（is_action_legal/narrative/is_death/
   sanity_damage）是否能表达成一个可行的 JSON Schema

产出 Plan：如果网关/模型支持，给出试点接入方案（先只约束 4 个必需字段，其余字段维持
现状兜底，避免一次性大改动摇动 SSE 契约）；如果不支持，说明原因并给出退而求其次的方案
（比如引入轻量开源约束解码库）。等我确认方案后再进入 Code 模式实现。

验证（进入 Code 模式后）：
- pnpm test:e2e:chat
- pnpm test:e2e:contract
- pnpm benchmark:chat:mock（确认首字延迟未回退）
```

**#4 · 补齐 EpistemicFilter 回接 prompt 组装（Code 模式）**

```
Code 模式，先定位后修复：
src/app/api/chat/route.ts 约 2064 行、3062 行各有一处 TODO(phase-3)，对应
docs/turn-engine-architecture.md 自己标注的 5 个 transitional 缺口之一——
EpistemicFilter（src/lib/epistemic/guards.ts 的 canActorKnowFact）目前没有完整
回接到 prompt 组装阶段。

请先读 docs/turn-engine-architecture.md 确认这 5 个缺口的完整清单和当前状态，
再具体定位这两处 TODO 各自缺什么（是完全没调用 canActorKnowFact，还是调用了但
结果没传入 prompt 组装函数）。只修复 EpistemicFilter 这一个缺口，不要顺手处理
其余 4 个（除非它们是同一处代码的必然连带修改）。

约束：不能改变 /api/chat 的 SSE 帧契约（__VERSECRAFT_STATUS__/__VERSECRAFT_FINAL__
语义不变），不能让 NPC 认知过滤在现有测试通过的场景里产生行为倒退。

验证：
- pnpm dlx tsx --test src/lib/epistemic/epistemicMatrix.test.ts
- pnpm test:e2e:chat
- pnpm eval:npc-consistency:mock（即使目前是纯规则实现，也应保持通过）
```

### P1

**#5 · 世界知识检索升级为真正混合检索（Code 模式，范围较大建议分两步）**

```
Code 模式，分两步走，第一步先只做只读评估：
src/lib/worldKnowledge/vectorSearch.ts 目前直接 return []，是未启用的 phase-3
占位符；真实检索靠 src/lib/worldKnowledge/retrieveWorldKnowledge.ts 里的 SQL
结构化查询 + tag JOIN + Postgres 全文检索 ts_rank，rerank.ts 用字符串包含打分
而非向量相似度。

第一步（评估）：核查当前 PostgreSQL 是否已装 pgvector 扩展、worldKnowledgeChunks
表的 embeddingVector 字段在真实 DB 里是什么类型（src/db/ensureSchema.ts 相关逻辑），
评估引入真实 embedding（可以是本地小模型，不一定要调用在线大模型 API）的延迟和
成本影响，是否会侵入 /api/chat 首字延迟预算。

第二步（实现，需我确认评估结果后再做）：让 vectorSearch.ts 接入真实 embedding 检索，
和现有 SQL/全文检索做混合排序（不是替换，是叠加），只影响 retrieveWorldKnowledge.ts
和 rerank.ts 内部实现，不改变对外返回的数据结构和调用方接口。

验证：
- pnpm dlx tsx --test <worldKnowledge 相关测试>
- pnpm eval:chat-quality:mock
- pnpm benchmark:chat:mock（重点关注是否侵入首字延迟预算）
```

**#6 · eval 脚本诚实化 + 接入孤儿脚本（Code 模式）**

```
Code 模式：
src/lib/evals/chatQualityRubric.ts 等"评估"脚本目前是纯规则判断（httpStatus/
字符数区间/正则黑名单/固定延迟阈值），eval-npc-consistency 的 mock/live 两种
模式执行完全相同的本地规则、不发真实请求；且 eval:npc-consistency 这个 npm
script 从未被 .github/workflows/ci.yml 引用。

请分两部分处理：
1. 先把 eval:npc-consistency 接入 CI（参照 narrative-safety-mock-gate 现有
   job 的写法），让它至少作为规则检查真正生效，而不是写了没人跑。
2. 评估是否要给 chat-quality/npc-consistency 增加一个真正的 LLM-as-judge
   模式（用 reasoner 或 control 角色对生成内容做质量打分，注意 reasoner
   不能进 PLAYER_CHAT 在线链路，这里是离线评估场景，允许使用）。如果要做，
   先只加一个新的 eval 脚本（如 eval:npc-consistency:live-judge），不要
   动现有 mock 规则脚本的行为，避免破坏现有 CI gate 的确定性。

验证：
- 本地跑通新增/修改的 eval 脚本
- 确认 CI 里新 job 能正确 pass/fail
- pnpm test:ci
```

**#7 · 高风险文件补测试覆盖（Code 模式，建议分文件提交）**

```
Code 模式，按文件拆成独立小 diff 分别提交，不要一次性大改：

CLAUDE.md 第10节列出的12个高风险文件中，以下3个缺运行时单测：
1. src/app/api/chat/route.ts —— 现有 e2e/chat-sse-contract.spec.ts 只做
   静态字符串断言，没有覆盖 route.ts 内部函数的运行时单测
2. src/app/play/page.tsx —— 只有辅助模块的测试，页面主逻辑本身无测试
3. src/components/HydrationProvider.tsx —— 无任何测试证据

请从风险最高的 route.ts 开始，为 resolveDmTurn 前后的关键分支（control preflight
决策、validateNarrative 触发 narrativeOverride 的路径、commitTurn 成功/失败路径）
补充可独立运行的单测，优先覆盖当前没有测试保护、但改动概率较高的函数，而不是追求
覆盖率数字。每个文件的测试补充作为独立提交，方便我逐个 review。

验证（每个文件完成后跑）：
- pnpm dlx tsx --test <新增测试文件>
- pnpm test:e2e:chat（确认没有破坏现有契约）
```

**#8 · 理智值升级为状态效应系统（Code 模式，建议先出数值设计草案）**

```
先用 Plan 模式给出数值设计草案，我确认后再 Code：
当前 src/lib/sanityDamage.ts 只是数值扣减到 0 判定死亡，没有中间状态效应、
没有自动恢复。参考 Darkest Dungeon 的 Stress→Affliction 设计（压力满值触发
一次判定，进入某种性格缺陷状态）和 Call of Cthulhu 的临时疯狂规则（单次损失
达阈值→判定→限时状态效应→可能永久后遗症），设计一套适合"序章·暗月"悬疑
风格的中间状态效应机制。

重点：请评估能否让"高危理智状态"与现有 canon/reveal 分级门禁
（src/lib/turnEngine 或 src/lib/canon 相关 revealGate.ts 的 classifyGate）
联动——理智越低，能看到的真相分级越高（呼应 Bloodborne "认知是双刃剑"的
设计理念），这样可以复用已有的分级基础设施而不是另起一套。

约束：不要破坏现有 sanity_damage/is_death DM JSON 字段契约（下游
normalizePlayerDmJson 的必填字段校验不能动），新增状态字段走现有
"新增持久化字段需检查默认值/migrate/旧存档兼容"的流程。

先给我数值设计草案（阈值、状态效应种类、恢复条件、与 reveal 分级的具体映射关系），
不要直接写代码。
```

**#9 · 任务系统补齐服务端自动失败判定（Code 模式）**

```
Code 模式：
src/lib/tasks/taskV2.ts 里 GameTaskStatus 定义了 failed 状态（约28-33行），
但通读全文件没有发现服务端自动判定任务失败的逻辑（无超时/心跳检测），完全依赖
AI 主动在 task_updates 里声明。

请设计并实现一个服务端兜底判定（比如：任务关联的游戏内时间/天数超过某阈值仍未
completed 则自动转 failed，具体阈值从任务的 hiddenTriggerConditions 或新增字段
读取），作为 AI 主动声明之外的确定性兜底，而不是替代 AI 的正常声明路径。

约束：这个逻辑放在哪一层需要你先判断——如果放进 /api/chat 在线路径可能影响首字
延迟预算，评估是否更适合放进 world engine 的后台 tick（src/lib/worldEngine/*）
里做批量判定。做出选择后说明理由。

验证：
- pnpm dlx tsx --test <taskV2 相关测试>
- pnpm test:e2e:contract
```

### P2

**#10 · 技术债清理批次（Code 模式，建议拆 3 个独立小 PR）**

```
Code 模式，请拆成3个独立的小改动分别提交，不要合并成一个大 diff：

1. SSE 常量去重：src/lib/turnEngine/sse.ts 和 src/lib/narrativeEngine/
   streamFrames.ts 里 __VERSECRAFT_STATUS__/__VERSECRAFT_FINAL__ 等常量字面量
   相同但各自独立定义，route.ts 只 import 后者。核实前者是否还有其他调用方
   （目前已知只被自己的测试引用），确认无其他依赖后统一到一处，删除重复定义。

2. CI 补 docker build 验证：.github/workflows/ci.yml 目前没有任何 job 执行
   docker build，Dockerfile 的可构建性从未被 CI 验证过。新增一个 job（不需要
   push镜像，只需要 build 验证），失败即挡住合并。

3. 数据库枚举字段：src/db/schema.ts 里 worldEntities.status/scope 等20+个
   取值有限的字段目前是裸 varchar，评估哪些字段适合改成 pgEnum（注意这属于
   schema 变更，需要走 migration，不要在没有确认迁移策略前直接改）。这一项
   如果涉及生产数据迁移，请先只出 Plan，不要直接生成 migration。

验证：
- npx eslint .
- pnpm test:ci
- 涉及 schema 改动的部分：pnpm db:check:optional（不要运行 pnpm db:push）
```

**#11 · NPC 关系记忆的叙事化呈现（Plan 模式优先）**

```
先用 Plan 模式：
当前 NPC 关系系统有 6 轴数值但 UI（codexDisplay.ts 的 computeRelationshipLabel）
只输出4档粗粒度文字标签，玩家感知不到关系的细腻变化和历史轨迹。参考"星野"用
"记忆相片"把抽象数值具象化为可回顾资产的做法，评估在不暴露原始数值（保持当前
"叙事化优先于数值化"的产品调性）的前提下，能否给玩家一个"关系关键节点回顾"式
的呈现（例如结算页已有的"关键选择回顾"模块，评估能否在正常游玩中也提供类似的
轻量入口，而不只是结局才看得到）。

请先出方案（呈现形式、数据来源、是否需要新增持久化字段），不要直接写 UI 代码，
我确认方向后再进入实现。
```

**#12 · 理智分档联动叙事视角（Code 模式，中等工作量）**

```
Code 模式：
参考 Sunless Sea/Fallen London 的手法——理智状态不只是数值判定依据，也应该
影响 narrative 文本本身的呈现方式（比如低理智时用更破碎、不可靠的叙事视角）。

请评估在 src/lib/playRealtime/playerChatSystemPrompt.ts 里按当前理智值分档
（需要先确定分档阈值，可复用 #8 里设计的状态效应分档）给 system prompt 注入
不同的"叙事视角指令"，并在 validateNarrative.ts 里对应放宽/收紧某些规则式检查
（比如低理智档允许更多不确定性表达）。

约束：这属于 prompt 语义边界的改动，请对照 CLAUDE.md 6.3 节的策略——先判断
能否用更窄的 runtime packet/typed field 解决，如果确实要改 stable prompt
语义，检查是否需要更新 VERSECRAFT_DM_STABLE_PROMPT_VERSION。

验证：
- pnpm eval:chat-quality:mock
- pnpm eval:narrative-safety:mock
- pnpm test:e2e:contract
```

---

## 五、调研方法与局限性说明

**代码库调研**：由 2 个只读子代理独立完成，覆盖玩法系统（图鉴/任务/关系/道具/位置/理智/BGM/世界知识/内容规模/代码质量）与技术架构（turn engine/AI服务层/测试评估/world engine/analytics/文档/部署CI/DB schema）共18个维度，每条结论均要求附具体文件路径与代码细节。本报告对其中最关键、最影响优先级判断的一条结论（NPC 关系数值写入不一致）做了**独立的一手复核**——本人直接 Grep+Read 了 `useGameStore.ts` 和 `play/page.tsx` 的相关代码段，确认 `mergeCodex` 确实是覆盖写且无 `clampRelation` 调用，而 `applyTaskRelationshipConsequencesToCodex` 确实是累加写且有裁剪，两者字段集合完全重叠。其余代码级结论未逐条二次复核，建议在实际执行第四节提示词前，让 Claude Code 自行重新确认一遍具体行号（代码可能在本报告完成后已有变动）。

**网络调研**：22 次独立检索 + 1 次对最重要外部结论（OpenAI Structured Outputs 的可靠性数据）的一手来源核验（直接抓取官方博客全文，确认 100% vs <40% 的具体数字、约束解码技术细节、致谢 outlines/jsonformer/guidance/lark 等信息均属实）。未对其余每一条外部结论逐一做三方交叉验证（即未执行"3 票裁决"式的完整对抗性核验），而是采用了更轻量的方法：优先选择官方一手来源（厂商博客、论文原文、政府公告）、对来自单一非权威来源的具体数字（如 Character.AI 的"400字符记忆盒"“turn 21 重置”、星野 DAU 数据）在正文中明确标注"来自第三方/置信度中等"，对有多来源交叉印证的数据（如 MiniMax 财务数据）标注"多来源交叉验证"。这意味着本报告的严谨度好于泛泛而谈的调研，但没有达到逐条形式化三方对抗核验的强度，请在做重大决策（尤其是合规相关判断）时以官方原文和法务意见为准。

**范围局限**：本报告聚焦"改良方向识别"而非"实施细节设计"，第四节提示词是任务简报而非完整技术方案，实际执行时 Claude Code 仍需重新读取当前代码（尤其是行号可能已随时间漂移）、按 CLAUDE.md 协议自行验证后再动手。

---

## 六、引用来源

### 商业产品
- [Latitude：AI Dungeon Memory System](https://latitude.io/blog/how-the-new-memory-system-works)
- [AI Dungeon 帮助中心：Memory System](https://help.aidungeon.com/faq/the-memory-system)
- [AI Dungeon - Wikipedia](https://en.wikipedia.org/wiki/AI_Dungeon)
- [Character.AI 官方博客：Smarter Memory](https://blog.character.ai/memory/)
- [Kenotic Labs：Why Does Character AI Forget Everything](https://kenoticlabs.com/insights/character-ai-memory)
- [TechCrunch：Hidden Door](https://techcrunch.com/2022/10/27/hidden-door-wants-to-turn-fiction-into-immersive-roleplaying-experiences/)
- [Businesswire：Hidden Door 融资](https://www.businesswire.com/news/home/20220316005334/en/Hidden-Door-Launches-AI-Game-Platform-to-Build-the-Narrative-Multiverse)
- [NVIDIA Blog：Inworld AI NPC](https://blogs.nvidia.com/blog/generative-ai-npcs/)
- [Lightspeed：Inworld Character Engine](https://lsvp.com/stories/inworld-ai-npcs-character-engine/)
- [Convai：Knowledge Bank 构建指南](https://convai.com/blog/building-ai-characters-knowledge-bank-with-convai)
- [NVIDIA：Convai Spotlight](https://developer.nvidia.com/blog/spotlight-convai-reinvents-non-playable-character-interactions/)
- [NVIDIA Blog：ACE 数字人架构](https://blogs.nvidia.com/blog/ai-decoded-ace-microservices-digital-humans/)
- [Ubisoft 官方：Ghostwriter](https://news.ubisoft.com/en-us/article/7Cm07zbBGy4Xml6WgYi25d/the-convergence-of-ai-and-creativity-introducing-ghostwriter)
- [TechCrunch：Ubisoft Ghostwriter](https://techcrunch.com/2023/03/22/ubisofts-new-ai-tool-automatically-generates-dialogue-for-non-playable-game-characters/)
- [Fable Studio：Showrunner-agents 论文站点](https://fablestudio.github.io/showrunner-agents/)
- [Variety：Amazon 投资 Fable Showrunner](https://variety.com/2025/digital/news/netflix-of-ai-amazon-invests-fable-showrunner-launch-1236471989/)

### 中国市场与监管
- [知乎：如何做好一个专业的剧本杀主持人(DM)](https://zhuanlan.zhihu.com/p/89039180)
- [indienova：AI 剧本杀叙事方式探索](https://indienova.com/indie-game-development/exploration-of-narrative-approaches-in-ai-driven-murder-mystery-games/)
- [人人都是产品经理：为什么 AI 陪伴产品都想抄星野](https://www.woshipm.com/evaluating/5946439.html)
- [星野官网](https://www.xingyeai.com/)
- [Sacra：MiniMax 估值与财务](https://sacra.com/c/minimax/)
- [MiniMax 官方：2025 全年财报](https://www.minimax.io/news/minimax-global-announces-full-year-2025-financial-results)
- [S&P Global：MiniMax 营收预测](https://www.spglobal.com/market-intelligence/en/news-insights/research/2026/04/minimax-revenue-seen-rising-to-usd219m-in-2026-reaching-usd6b-by-2030)
- [Pandaily：Talkie 广告收入](https://pandaily.com/minimaxs-app-talkie-generates-significant-advertising-revenue/)
- [萌娘百科：未定事件簿](https://zh.moegirl.org.cn/zh-hans/%E6%9C%AA%E5%AE%9A%E4%BA%8B%E4%BB%B6%E7%B0%BF)
- [国家网信办：人工智能拟人化互动服务管理暂行办法（正式）](https://www.cac.gov.cn/2026-04/10/c_1777558395078289.htm)
- [国家网信办：专家解读](https://www.cac.gov.cn/2025-12/28/c_1768662848000498.htm)
- [China Law Translate：英文译本](https://www.chinalawtranslate.com/human-like-ai/)

### 学术研究
- [Subodh Jena：Stanford Generative Agents 记忆架构解读](https://www.subodhjena.com/blog/generative-agents-memory-stanford)
- [ACM：Generative Agents 论文全文](https://dl.acm.org/doi/fullHtml/10.1145/3586183.3606763)
- [AAAI：Façade 交互戏剧架构](https://ojs.aaai.org/index.php/AIIDE/article/view/18722)
- [Façade GDC 论文](https://users.soe.ucsc.edu/~michaelm/publications/mateas-gdc2003.pdf)
- [Versu 官网](https://versu.com/about/)
- [Emily Short 博客：Versu 介绍](https://emshort.blog/2013/02/14/introducing-versu/)
- [Voyager 项目页](https://voyager.minedojo.org/)
- [arXiv：Voyager 论文](https://arxiv.org/abs/2305.16291)
- [arXiv：Reflexion 论文](https://arxiv.org/pdf/2303.11366)
- [CMU：Theory of Mind in Multi-Agent Systems 博士论文](https://ml.cmu.edu/research/phd-dissertation-pdfs/ioguntol_phd_mld_2025.pdf)
- [arXiv：MindGames](https://arxiv.org/pdf/2305.03353)

### 技术模式
- [OpenAI：Introducing Structured Outputs（已一手核验）](https://openai.com/index/introducing-structured-outputs-in-the-api/)
- [OpenAI 开发者社区：strict 模式讨论](https://community.openai.com/t/strict-mode-does-not-enforce-the-json-schema/1104630)
- [约束解码技术详解](https://mbrenndoerfer.com/writing/constrained-decoding-structured-llm-output)
- [NVIDIA：RAG 用于游戏开发](https://developer.nvidia.com/blog/evolving-ai-powered-game-development-with-retrieval-augmented-generation/)
- [arXiv：SCORE 叙事一致性检索增强](https://arxiv.org/pdf/2503.23512)
- [arXiv：知识图谱引导生成式叙事](https://arxiv.org/html/2505.24803v2)
- [Redis 工程博客：流式 LLM 响应](https://redis.io/blog/streaming-llm-responses/)
- [Redis：LLM UX 速度延迟缓存](https://redis.io/blog/how-to-improve-llm-ux-speed-latency-and-caching/)
- [Latitude：流式延迟优化](https://latitude.so/blog/latency-optimization-in-llm-streaming-key-techniques)
- [Wray Castle：AI 内容审核概览](https://wraycastle.com/blogs/telecoms-regulation-knowledge-base/ai-content-moderation)

### 恐怖/悬疑游戏理智机制
- [Game Developer：Darkest Dungeon Affliction 系统设计解析](https://www.gamedeveloper.com/design/game-design-deep-dive-i-darkest-dungeon-s-i-affliction-system)
- [Darkest Dungeon 压力机制动态分析](https://nicolaluigidau.wordpress.com/2024/02/06/the-dynamics-of-stress-in-darkest-dungeon/)
- [Chaosium：Call of Cthulhu 官方理智值规则](https://cthulhuwiki.chaosium.com/rules/sanity.html)
- [TechRaptor：Bloodborne Insight 机制解析](https://techraptor.net/gaming/features/bloodborne-insight-interesting-mechanic)
- [ResetEra：Bloodborne Insight 讨论](https://www.resetera.com/threads/why-is-the-bloodborne-insight-mechanic-so-effective.1339918/)
- [Fallen London Wiki：Sunless Sea Terror 机制](https://fallenlondon.wiki/wiki/Sunless_Sea)

### 留存与商业化
- [RevenueCat：2026 订阅应用状态报告](https://www.revenuecat.com/state-of-subscription-apps/)
- [Track360：AI 陪伴行业市场与留存报告 2026](https://track360.io/blog/ai-companion-industry-report-market-size-growth-retention-2026)

---

*本报告基于 2026-07-01 的代码库快照与检索结果，代码行号与外部产品数据均可能随时间变化，实际执行改造前请以最新代码与官方信息为准。*
