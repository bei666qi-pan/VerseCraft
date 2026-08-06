## Context

VerseCraft 的导演智能体编排的正确数据流如下：

```
用户在线回合 (Turn N)
  │
  ├─► DM Agent 写作（若无 plan → 自主模式；若有 plan → 引导模式）
  │    └─ 从 promptAssembly 加载 directorHintBlock + agenda
  │
  └─► 回合提交 → enqueueWorldEngineTick (Redis 去重)
       │
       └─► World Director Tick (异步推演)
            ├─ load_context
            ├─ build_messages
            ├─ run_reasoner (reasoner 推理)
            ├─ parse_delta → validate → critic
            ├─ write_outputs → agenda 持久化
            └─ 生成 directorHintBlock (方向约束块)
                 │
                 ▼
            下一回合 (Turn N+1) 的 promptAssembly 读取
            → 注入 DM Agent system prompt
```

**关键约束**（来自用户确认）：

1. **异步在线推演**：World Director tick 由用户在线回合触发执行（post-turn 入队），用户不在线时不启动
2. **两阶段行为**：
   - 用户刚进入、尚未有 director plan → 写作 agent 不受控，自主发挥
   - 一旦 director plan 生成 → 必须切实引导剧情发展，写作 agent 遵循 plan 方向
3. **Plan 是方向，不是事实**：导演 plan 提供剧情走向、节奏、事件方向等引导（以 `directorHintBlock` 形式注入 prompt），但具体叙事事实仍由写作 agent（DM Agent）自行处理

## Goals / Non-Goals

**Goals:**
- 用 LangGraph `StateGraph` 替换 World Director 推演的串行调用链，保持每步业务逻辑不变
- 用 LangGraph 子图替换 Actor Simulation 的嵌套调用链
- 用 LangGraph tool-calling agent 图替换 DM Agent tool loop 的 `while` 循环
- **显式建模 `hasPlan` 信号**：graph 输出携带两阶段标识，下游能据此切换自主/引导模式
- **导演 plan 切实引导写作 agent**：graph 生成 `directorHintBlock`，通过 promptAssembly 注入 DM 的 system prompt
- 为 World Director 主图启用 PostgreSQL-backed checkpoint
- 通过 `VERSECRAFT_ENABLE_LANGGRAPH` 特性开关零风险灰度

**Non-Goals:**
- 不修改 `/api/chat` 的路由逻辑和 SSE 协议
- 不修改 Story Director（`storyDirector/postTurn.ts`）
- 不修改 prompt 内容、validator 逻辑、epistemic filter
- 不改变 plan 的语义——它始终是方向性约束，不替代写作 agent 的事实生成
- 不引入多 agent 协商

## Decisions

### 1. World Director 图拓扑（修正版）

```
                    ┌── 用户在线回合触发 ──┐
                    │ post-turn enqueue    │
                    ▼                      │
START                                         │
  │                                           │
  ▼                                           │
load_context ──── fail → END (无可用数据)      │
  │                                           │
  ▼                                           │
build_messages                                │
  │                                           │
  ▼                                           │
run_reasoner ─── fail → retry → fallback      │
  │                    (1次重试, 2次走降级)     │
  ▼                                           │
parse_delta ──── invalid → repair → skip      │
  │                                           │
  ▼                                           │
validate_plan ─ violation → continue degraded │
  │                                           │
  ▼                                           │
run_critic (可选, 失败不阻塞)                   │
  │                                           │
  ▼                                           │
apply_social_gm (可选, 失败不阻塞)              │
  │                                           │
  ▼                                           │
write_outputs ── fail → rollback agenda       │
  │                                           │
  ▼                                           │
compute_next_state + build_director_hint       │
  │                                           │
  ▼                                           │
END ──► hasPlan: boolean                      │
        directorHintBlock: string             │
        agendaItems: [...]                    │
        │                                     │
        ▼                                     │
   写入 DB → 下一回合 promptAssembly 读取 ─────┘
```

**条件边路由逻辑**:
- `load_context` 失败（DB 不可用/session 不存在）→ 直接 END，`hasPlan: false`
- `run_reasoner` 失败 → 重试一次；二次失败走 fallback（生成空 plan），`hasPlan: false`，写作 agent 自主模式
- `parse_delta` 非法 JSON → repair prompt 一次；二次失败跳过本轮，`hasPlan: false`
- `validate_plan` 违规 → 标记 degraded，继续执行但 plan 置信度降低
- `write_outputs` 失败 → 回滚已持久化的 agenda items

### 2. Plan 的两阶段行为建模

**`hasPlan` 信号** 贯穿 graph 全生命周期：

```typescript
interface WorldDirectorGraphState {
  // ... 其他字段
  hasPlan: boolean;              // false 直到 parse_delta 成功
  planConfidence: "none" | "degraded" | "normal";
  directorHintBlock: string;     // 方向约束块，注入写作 agent prompt
}
```

- `load_context` 阶段：`hasPlan: false`
- `parse_delta` 成功后：`hasPlan: true`，`planConfidence: "normal"`
- validator 违规但继续：`hasPlan: true`，`planConfidence: "degraded"`
- 任一关键步骤失败：`hasPlan: false`

**写作 agent 侧行为**：
- `hasPlan: false` → 写入 `promptAssembly` 时不注入 `directorHintBlock`，DM agent 完全自主
- `hasPlan: true, planConfidence: "normal"` → 注入完整 `directorHintBlock`，DM agent 遵循方向
- `hasPlan: true, planConfidence: "degraded"` → 注入简化版 hint（仅关键方向，不给细节）

### 3. Plan 的方向性约束原则

`directorHintBlock` 的设计契约：

```
## 导演方向指引（遵循以下方向，具体事件和对话由你自行创作）

- 当前剧情阶段: [quiet / build_up / pressure / release / reveal]
- 推进方向: "引导玩家前往旧图书馆调查失踪线索"
- 关键事件: 图书馆管理员 NPC 出现，提供一份残缺地图
- 节奏要求: 保持悬疑氛围，不要过早揭示真相
- 禁止: 不要引入新角色，不要跳过调查阶段直接揭示凶手

注意：以上为方向指引，具体的对话内容、场景描写、NPC 反应由你根据
当前游戏状态和人物性格自行创作。不要逐字复制指引内容。
```

对比当前代码中的 `directorHintBlock` 生成逻辑（`promptAssembly.ts:480`），确保语义一致但结构更清晰。

### 4. Actor Simulation 子图

与主图相同，Actor Simulation 作为独立 `StateGraph<ActorSimState>`，在主图的 `actor_simulation` 节点中作为编译子图调用。子图使用 LangGraph `Send` API 实现 N 个 actor 的并行 fan-out。

### 5. DM Agent 图

使用 LangGraph `ToolNode` + 条件边替代 `while(isDmAgentRound)`，硬约束不变（2 轮/30s/3s per tool）。

在 DM Agent 图的 prompt 中，根据 `hasPlan` 信号决定是否注入 `directorHintBlock`：有 plan 时注入引导，无 plan 时不注入。

### 6. Checkpoint 策略

通过 `PostgresSaver` 对 World Director 主图启用 checkpoint（新增 `langgraph_checkpoints` 表，7 天 TTL）。在 `run_reasoner` 和 `run_critic` 之前插入 `interruptBefore`，支持 worker 重启后从断点恢复。

### 7. 特性开关与兼容性

```
VERSECRAFT_ENABLE_LANGGRAPH=false (默认) → 现有手工管线
VERSECRAFT_ENABLE_LANGGRAPH=true         → LangGraph 管线
```

向后兼容验证：关闭时所有现有测试通过。开启时新路径通过相同契约测试。

### 8. 模块组织

```
src/lib/langgraph/
├── index.ts
├── worldDirectorGraph.ts         # World Director 主图定义 + 条件边
├── worldDirectorState.ts         # State schema (含 hasPlan/planConfidence/directorHintBlock)
├── actorSimulationSubgraph.ts    # Actor Simulation 子图
├── dmAgentGraph.ts               # DM Agent 图
├── directorHintBuilder.ts       # directorHintBlock 构建器（纯函数）
├── checkpointer.ts              # PostgresSaver 工厂
├── featureFlag.ts               # 特性开关
└── __tests__/
    ├── worldDirectorGraph.test.ts
    ├── actorSimulationSubgraph.test.ts
    ├── dmAgentGraph.test.ts
    └── directorHintBuilder.test.ts
```

## Risks / Trade-offs

| 风险 | 缓解 |
|------|------|
| LangGraph 节点调度开销（~1-5ms/step）累加到 World Director tick | tick 耗时主要在下限推理（秒级），调度开销可忽略；通过 `world_engine_langgraph_node` 监控 |
| `hasPlan` 信号误判导致写作 agent 在应有引导时进入自主模式 | `hasPlan` 是纯从图状态推导的布尔值，单元测试覆盖所有失败路径的场景 |
| `directorHintBlock` 内容过于具体，限制写作 agent 的事实创作空间 | hint 仅包含方向性描述（阶段、方向、关键事件类型、禁止事项），不含具体对话/描写；通过 `directorHintBuilder.test.ts` 验证输出格式 |
| `PostgresSaver` 对 DB 连接池压力 | checkpoint 写入频次低（~10 writes/tick），复用现有 pool |
| 新旧路径长期并存增加维护成本 | LangGraph 路径稳定后移除旧路径（另开 change） |
