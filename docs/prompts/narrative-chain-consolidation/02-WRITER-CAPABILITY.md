# Phase 2：建立唯一玩家可见 Writer 能力

## 使命

把玩家可见叙事责任统一到 `Writer`，减少 `main/enhance` 语义重叠，同时保留 `control` 的在线快判职责和 `reasoner` 的后台离线职责。

本阶段的重点是“能力与责任统一”，不是追求全仓改名。语义清晰、配置兼容和延迟稳定优先于命名整齐。

## OpenSpec

这是 AI routing、prompt 和网关配置变更，必须使用独立或明确扩展的 OpenSpec change。

如果 `integrate-bounded-dm-agent-tools` 已严格收口为 mechanics 能力，不要把 Writer 全量迁移继续塞入该 change。使用 `openspec-propose` 创建一个目标单一的 change，例如：

```text
consolidate-player-facing-writer
```

proposal 必须说明旧配置兼容、analytics 影响、回滚和为什么不合并 control/reasoner。

## 责任边界

### Writer 负责

- PLAYER_CHAT 玩家可见正文。
- 已裁决 mechanics 结果的文学呈现。
- 场景增强、情绪润色等玩家可见修辞能力。
- 玩家切换语言后的已裁决内容呈现。
- 基于允许的 director hints 生成自然叙事。

### Writer 不负责

- 意图分类和风险 lane。
- 安全政策裁决。
- 伤害、奖励、掉落、任务状态等领域规则。
- 提交 StateDelta 或写 FINAL。
- 后台世界推演。
- 判断 NPC 能否知道某个事实。

### 必须保留

- `control`：低延迟控制面、意图和风险快判；失败快速 fail-open。
- `reasoner`：WORLDBUILD、STORYLINE_SIMULATION、critic、eval 等离线任务；永不进入 PLAYER_CHAT。
- deterministic guards/validators/commit：它们不是模型角色，不能被 Writer 替代。

## 迁移策略

### 第一步：业务 facade

优先在 `logicalTasks.ts` 和相关调用方建立 Writer 语义入口，例如 `generateWriterTurn` 或等价能力，同时保留现有导出兼容层。

不要一开始就全仓替换 `main`。

### 第二步：任务矩阵收敛

明确哪些任务归 Writer，更新 `TASK_POLICY` 与 forbidden matrix。PLAYER_CHAT 仍必须明确禁止 `reasoner`。

如果场景增强仍作为独立 post-stream stage 存在，它可以由同一个 Writer role 承担，但必须继续受预算和门控约束，不能阻塞首字。

### 第三步：配置兼容

若正式引入 `writer` 逻辑角色：

- 新配置优先使用 `AI_MODEL_WRITER`。
- 未配置时回退 `AI_MODEL_MAIN`。
- `AI_MODEL_MAIN` 不立即删除。
- 旧 `AI_PLAYER_ROLE_CHAIN` 中的 `main` 必须可兼容解析。
- 旧 vendor-id migration 仍正常工作。
- admin/debug 路由报告能说明 canonical role 与 legacy alias。
- analytics 历史口径不得因一次改名被切断；需要映射或兼容读取。

如果引入 canonical `writer` 会造成大量低价值改动，可以在本阶段只完成 Writer capability facade，并把逻辑 role 字符串迁移列为后续独立 change。必须在 design 中记录选择依据。

## Prompt 规则

- Writer prompt 必须明确：`committed/candidate state delta` 才是事实，narrative 无权创造状态。
- Writer 可以采用 due director hints，但它们是软提示，不得直接展示 private hooks。
- NPC 发言必须遵守 epistemic packet；不得用全局摘要覆盖 actor-scoped 知识。
- 任何要求 JSON 的 prompt 必须包含字面量 `请严格以 JSON 格式输出`。
- 修改 stable prompt 语义时评估并按现有机制更新 `VERSECRAFT_DM_STABLE_PROMPT_VERSION`。
- 不通过不断增加 prompt 长度解决可由 typed packet、validator 或 domain service 解决的问题。

## 性能要求

- Writer 必须保持 PLAYER_CHAT 流式输出。
- 不把 post-stream enhance 重新放到首字前。
- 不因为合并角色增加在线 role chain 或 reasoner fallback。
- `firstVisibleTextMs` 和 FINAL 预算继续满足 AGENTS.md。
- 配置缺失或 Writer 上游失败时，继续使用现有 SSE 降级语义。

## 测试要求

至少覆盖：

1. Writer task → canonical/legacy model 配置解析。
2. 只配置 `AI_MODEL_MAIN` 的旧部署仍能 PLAYER_CHAT。
3. 只配置新 Writer 环境变量时能正常路由。
4. 旧 `main` role chain 能被兼容解析。
5. PLAYER_CHAT 永不选择 reasoner/enhance。
6. control preflight 不被 Writer 慢 fallback 拖长。
7. enhancement 失败不改变已裁决 StateDelta。
8. 路由 telemetry 能区分 intended/actual role，并保持旧 analytics 可读。
9. prompt 中包含 state-delta-first、epistemic 和严格 JSON 必需语句。
10. SSE 和延迟 contract 不回归。

## 最低验证

```bash
pnpm exec tsx --test src/lib/ai/models/*.test.ts
pnpm exec tsx --test src/lib/ai/tasks/*.test.ts
pnpm exec tsx --test src/lib/ai/config/*.test.ts
pnpm exec tsx --test src/lib/ai/router/*.test.ts
pnpm exec tsx --test src/lib/playRealtime/playerChatSystemPrompt.test.ts
pnpm test:e2e:chat
pnpm benchmark:chat:mock
npx eslint .
```

## 阶段完成定义

- 玩家可见叙事只有一个明确 Writer 责任主体。
- control/reasoner 未被错误合并。
- 旧 main 配置、role chain、analytics 和降级路径仍兼容。
- PLAYER_CHAT 的 stream、forbidden route 和延迟预算没有退化。
- Writer prompt 无权创造结构化状态。
- OpenSpec 与 PROGRESS 已记录迁移策略和回滚方式。
