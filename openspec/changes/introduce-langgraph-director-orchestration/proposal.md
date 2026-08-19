> **Status: Superseded (not archived).** Replaced by `unify-world-director-runtime`; do not implement remaining tasks from this change.

## Why

当前导演智能体编排（World Director 推演管线、Actor Simulation 管线、DM Agent tool loop）全部依赖手工编写的串行/条件流程代码。随着编排逻辑日益复杂——加载→推理→解析→校验→critic→写入→注入 prompt——手工管道的可维护性、可观测性和可恢复性逐渐下降。

更关键的是，导演 plan 的生命周期存在明确的两阶段断层：plan 未生成时写作 agent 自主发挥，plan 一旦生成就必须切实引导剧情发展——当前手工管线中 plan 从生成到注入 prompt 的链路分散在 `worldEngine/engine.ts`、`agenda.ts`、`promptAssembly.ts` 和 `/api/chat/route.ts` 四个模块中，数据流向不直观。

LangGraph 提供声明式的有向状态图抽象，内置状态管理、条件路由、checkpoint/resume，能将这些分散的编排逻辑统一为可追溯、可中断恢复的图结构，同时保持项目既定的 "Workflow over agent" 原则——每个节点仍是确定性函数或已知任务调用，plan 是方向性约束而非事实输出，具体事实仍由写作 agent 自行处理。

## What Changes

- 新增 `@langchain/langgraph` 依赖（~200KB gzipped），并建立 `src/lib/langgraph/` 模块作为导演图层的统一入口
- 将 World Director 推演主线（`runWorldEngineTick`）重构为 LangGraph StateGraph，完整覆盖当前流程：加载上下文→构建 prompt→reasoner 推理→结构化解析→确定性校验→LLM critic→写入 agenda→生成 directorHint（注入写作 agent prompt 的方向块）
- 将 Actor Simulation 子管线（选角→输入构建→LLM 推演→校验→导演汇总）重构为 LangGraph 子图
- 将 DM Agent tool loop（`dmAgentOrchestrator.ts`）重构为 LangGraph tool-calling agent 图
- **显式建模导演 plan 的两阶段行为**：graph 输出中携带 `hasPlan: boolean`，下游写作 agent 据此切换自主模式/引导模式
- **Plan 是方向性约束**：graph 生成的 plan 以 `directorHintBlock` 形式注入写作 agent 的 system prompt，定义剧情走向、节奏、事件方向，但不指定具体事实——事实仍由写作 agent 自行生成
- 为 World Director 主图引入 checkpoint 机制，支持长时间 tick 的中断恢复
- 新增 `VERSECRAFT_ENABLE_LANGGRAPH` 特性开关（默认 false），关闭时完全回退到现有手工管道
- **不改变**：在线 `/api/chat` SSE 协议、Turn Engine、Story Director、validator 逻辑、数据库 schema（除 checkpoint 表）、analytics 事件名

## Capabilities

### New Capabilities

- `langgraph-director-graphs`: LangGraph 状态图替代 World Director 和 Actor Simulation 的手工管线编排，提供声明式节点定义、条件边路由、子图嵌套，显式输出 `hasPlan` 信号和 `directorHintBlock` 方向块
- `langgraph-checkpointing`: 为 World Director 主图提供 checkpoint/resume 能力，长 tick 中断后可从未完成节点恢复

### Modified Capabilities

<!-- 本次不修改任何已有 spec 的需求级别行为，仅替换编排实现层 -->

## Impact

- **依赖**: 新增 `@langchain/langgraph`（仅服务端，不影响客户端 bundle）
- **源代码**: `src/lib/worldEngine/engine.ts`（重构主流程为图定义）、`src/lib/worldEngine/actorSimulation/`（重构为子图）、`src/lib/ai/tools/dmAgentOrchestrator.ts`（重构为 tool-calling agent 图）、新增 `src/lib/langgraph/` 模块、`src/lib/playRealtime/promptAssembly.ts`（接收 graph 输出的 `directorHintBlock`）
- **配置**: 新增 `VERSECRAFT_ENABLE_LANGGRAPH` 环境变量（默认 false），经 `src/lib/config/*` 暴露
- **性能**: World Director tick 由用户在线回合触发（post-turn 入队），不在首字前路径中；图定义额外开销（~1-5ms 节点调度）对秒级 tick 可忽略
- **数据库**: 不新增业务表、不改 schema；checkpoint 数据存入现有 PostgreSQL，新增一张 `langgraph_checkpoints` 表
- **analytics**: 不改变现有事件名和 payload；新增 `world_engine_langgraph_node` 可选的细粒度追踪事件
- **SSE / JSON 契约**: 无影响（World Director 在 post-turn 执行）
- **/api/chat**: 不修改路由逻辑，仅 plan 消费方式从读 `agenda` 表改为接收 graph 输出的 `directorHintBlock`
