# 世界知识向量/混合检索升级评估（T4）

> 调研时间：2026-07。本文档只做现状评估与方案设计，**未执行任何代码改动、未运行任何数据库迁移**。
> 结论：现有架构已经为向量检索预留了完整接口，但要真正启用，存在 3 个无法在"不新增依赖、不确定能否跑迁移"前提下绕开的硬卡点（见第 3 节）。因此本次未直接实现，留待后续单独排期。

## 1. 现状：三层检索，向量层是空壳

`src/lib/worldKnowledge/retrieval/` 下已经是分层设计，不是简单关键词匹配：

- **精确匹配层**（exactKeyLookup）：按 `code` / `canonical_name` / `retrieval_key` 精确查找。
- **标签过滤层**（tagFilter）：按 `world_entity_tags.tag` 过滤候选。
- **FTS 全文检索层**（ftsSearch，`retrieveWorldKnowledge.ts` 约第 145–166 行）：**已经是真实可用的 Postgres 原生全文检索**，用 `content_tsv @@ plainto_tsquery('simple', ...)` 查询并按 `ts_rank` 相关的启发式打分（`Math.max(20, 70 - idx)`）排序。这一层不是占位符，是当前实际承担语义相关性排序的主力。
- **向量检索层**（`vectorSearch.ts`）：文件头注释明确写着"向量检索骨架（pgvector / ivfflat）。本阶段只定义接口"，函数体目前是 `return []`（第 9 行）。`retrieveWorldKnowledge.ts` 第 169 行的调用点注释同样写明"phase-3: interface reserved, runtime no-op by default"。也就是说：**接口已经接好了，只是运行时永远返回空数组**，`used.vectorCount` 恒为 0。

结论：现在的"检索质量"完全由 FTS + tag + 精确匹配三层撑住，向量层完全没有贡献。

## 2. Schema 已经为向量检索预留字段，但是降级态

`src/db/schema.ts` 里 `worldKnowledgeChunks` 表（约第 862–907 行）：

- `contentTsv`：Drizzle 层类型标注为 `text()`，但运行时由 `src/db/ensureSchema.ts` 实际建表为真正的 Postgres `tsvector` 类型（Drizzle 的 schema 定义只是"够用的近似类型"，真实 DDL 由 `ensureSchema.ts` 手写 SQL 控制，这是本仓库既有的"schema.ts 与真实 DB 有意 drift"模式之一，T8 会专门列出这类问题）。
- `embeddingModel` / `embeddingStatus`（默认 `"pending"`）/ `embeddingVector`：`embeddingVector` 在 Drizzle 层同样标注为 `text()`。
- `ensureSchema.ts`（约第 735–783 行）在建表时会先探测数据库是否已安装 pgvector 扩展：
  ```sql
  SELECT (to_regtype('vector') IS NOT NULL) AS has_vector
  ```
  探测失败或返回 false 时，`embedding_vector` 列的真实 DDL 类型退化为 `TEXT`；只有探测到 pgvector 时才会建成真正的 `vector(256)` 并追加 `ivfflat` 索引。
- 写入侧：`src/lib/worldKnowledge/ingestion/persistTurnFacts.ts` 第 259 行附近，`embedding_vector` 目前**永远写入 NULL**，只有 `embedding_status='pending'` 被设置，暗示"等将来有 batch job 来补齐"，但目前没有任何 batch job 在做这件事。

结论：这是一套刻意设计的"扩展缺失也能跑"的降级架构，工程上是合理的，但目前处于"字段存在、从未被真正写入或读取"的死字段状态。

## 3. 三个硬卡点（这是本次没有直接实现的原因）

1. **当前 Postgres 镜像不含 pgvector 扩展。** `docker-compose.yml` 里用的是官方 `postgres:15-alpine` 镜像，不是 `pgvector/pgvector` 系列镜像，也没有任何地方执行过 `CREATE EXTENSION vector`。要让 `ensureSchema.ts` 的探测结果从 false 变 true，要么换基础镜像，要么在已有 Postgres 实例上手动装扩展——这两者都超出"审阅代码即可完成"的范围，需要用户在自己的部署环境里操作，且如果换镜像/装扩展的环境是生产环境，必须谨慎评估。
2. **`drizzle-orm@0.45.1` 没有内置的 `vector()` column helper。** 本仓库当前锁定的 drizzle-orm 版本不原生支持 pgvector 类型（该特性是后续版本加入的）。这意味着即使数据库装好了 pgvector，Drizzle 层仍然只能把该列当 `text()` 处理，真正的相似度查询需要绕过 Drizzle 的类型系统、手写原生 SQL（`sql\`...\`` 转义查询），这是可以做但不轻松的额外工作，且做的时候必须非常小心 SQL 注入与参数化。
3. **AI 网关层完全没有 embeddings 端点集成。** 调研确认 `src/lib/ai/config/`、`src/lib/ai/gateway/` 下没有任何和 embedding 模型相关的环境变量、类型或调用函数（现在只有 chat completions 一条路径）。要产出向量本身，必须先决定"用哪个 embedding 模型/走哪个网关"，这本身是一个需要用户拍板（成本、模型选型、是否新增供应商）的产品决策，不是可以在这次"实现代码"里越俎代庖替用户决定的事。

这三点叠加起来：即使不新增 npm 依赖在技术上是可能的（pgvector 是数据库扩展不是 npm 包；相似度查询可以手写 SQL 不必依赖 SDK），但落地仍然需要——数据库环境变更（卡点 1，属于 CLAUDE.md 里"未经明确要求不做生产变更"的边界）、以及一个当前完全空白、需要用户先做选型决策的 embedding 供应商接入（卡点 3）。这两者都不是"我可以直接帮你实现"的范围，所以本次只做评估，不动代码。

## 4. 如果后续要做，建议的落地顺序

1. **先决策**：用哪个 embedding 模型/网关（现有 one-api 网关是否已代理某个 embedding 模型？还是要接入新的供应商）。这一步只能由用户决定，涉及成本和账号配置。
2. **数据库环境**：确认目标部署环境（Coolify/自建 Postgres）能否安装 pgvector 扩展，或者切换到预装 pgvector 的 Postgres 镜像；这一步需要用户在部署侧操作并验证，不建议在不确定生产影响的情况下由代理直接执行。
3. **补齐 AI 网关 embeddings 调用**：在 `src/lib/ai/gateway/openaiCompatible.ts` 旁新增一个 embeddings 调用路径（参考现有 chat completions 的错误处理/超时/重试模式），只有决策 1 完成后才有值填。
4. **实现 batch 向量化 worker**：一个后台任务扫描 `embedding_status='pending'` 的 chunk，调用 embeddings 接口，写回 `embedding_vector` 与 `embedding_status='ready'`；应该挂在现有 `scripts/vc-worker.ts` / `src/lib/worldEngine/*` worker 体系下，不进入 `/api/chat` 首包路径（遵循 CLAUDE.md 5.4 性能预算）。
5. **补齐 `vectorSearch.ts` 的真实实现**：用原生 SQL（`embedding_vector <-> $1` 之类的 pgvector 距离操作符）替换 `return []`，并接入 `retrieveWorldKnowledge.ts` 现有的多层合并/去重/打分逻辑（该合并框架已经存在，向量层只是需要真正产出候选而不是空数组）。
6. **验证**：现有 `src/lib/worldEngine/productionEnablement.test.ts` 已经在断言"pgvector 不可用时 KG job queue schema 仍能正常建表"，这条测试必须在整个改造过程中持续保持通过（确保新代码不破坏"扩展缺失也能跑"这一既有降级保证）。

## 5. 结论

现有架构的"分层检索 + 优雅降级"设计本身是健康的，向量检索是真正缺失的最后一层，不是需要推倒重来的技术债。但补齐它需要一个数据库环境决策 + 一个 embedding 供应商选型决策，两者都需要用户参与，不适合在当前"仅审阅代码即可完成"的会话范围内直接实现。建议作为独立任务排期，届时可直接使用本文档第 4 节的落地顺序。
