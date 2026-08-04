# VerseCraft 叙事链路合并与后台导演升级 · Codex Goal 提示词包

这套提示词用于让 Codex 在 Goal 模式中持续完成以下目标：

1. 收口当前 DM Agent / Function Calling 旁路，恢复统一 Turn Compiler 提交链。
2. 建立唯一玩家可见 `Writer` 能力，同时保留 `control` 与离线 `reasoner` 的职责隔离。
3. 把后台导演升级为有界的“选角 → NPC 行动推演 → 导演汇总”工作流。
4. 让任务、锻造、战斗、物品等玩法结构变化由受限 Function Calling + 服务端领域规则产生。
5. 完成契约、延迟、叙事安全、NPC 认知边界与灰度回滚验收。

## 一句话启动

在 Codex Goal 模式中直接发送：

```text
完整阅读并执行 docs/prompts/narrative-chain-consolidation/00-GOAL-ORCHESTRATOR.md；按其中阶段顺序、OpenSpec 工作流、进度协议和完成定义持续推进，直到全部验收通过或出现必须由我决策的真实阻塞。
```

这句话就是唯一需要记住的入口。不要逐个把阶段提示词重新粘贴给 Codex。

## 文件索引

| 文件 | 用途 | 执行顺序 |
|---|---|---:|
| `00-GOAL-ORCHESTRATOR.md` | Goal 模式总控、阶段门、进度与完成定义 | 必读入口 |
| `01-STABILIZE-DM-AGENT.md` | 修复 DM Agent 路由、旁路和最终提交链 | 1 |
| `02-WRITER-CAPABILITY.md` | 建立 Writer 能力及兼容迁移 | 2 |
| `03-DIRECTOR-ACTOR-SIMULATION.md` | 后台选角、NPC 推演、导演汇总 | 3 |
| `04-STRUCTURED-TOOLS.md` | Function Calling 与结构化输出治理 | 4 |
| `05-INTEGRATION-VALIDATION.md` | 集成、性能、eval、回滚和交付验收 | 5 |
| `RUNTIME-PROMPTS.md` | 未来实际注入模型的 Router/Actor/Director/Writer 提示词模板 | 阶段 3–4 使用 |

## 执行原则

- 这些阶段有严格依赖，不能让多个编码 Agent 同时修改 `src/app/api/chat/route.ts`、`taskPolicy.ts` 或 `worldEngine/engine.ts`。
- 如 Codex 使用子 Agent，只允许把文件范围互斥的只读调查、测试分析或纯模块任务并行化；共享入口由主 Agent 串行集成。
- 每阶段必须完成自己的测试、修复和复测，不设“只写代码、以后再测”的任务。
- 当前工作区可能包含大量用户未提交改动。不得 reset、clean、stash、回滚、覆盖或顺手提交无关文件。
- 不自动 push、部署、执行 `pnpm run ship`、数据库 push 或迁移；除非用户另行明确授权。
- OpenSpec change 的归档不属于默认执行范围；完成后同步 specs，归档等待用户或 PR 收口请求。

## Goal 断点续跑

总控执行时应创建并维护：

```text
docs/narrative-chain-consolidation/PROGRESS.md
```

新会话仍使用同一句启动语。总控必须先读取 `PROGRESS.md` 和当前代码，不重做已经有证据完成的阶段。
