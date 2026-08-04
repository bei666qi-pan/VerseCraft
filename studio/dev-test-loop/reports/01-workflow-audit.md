# VCDT-D01 流程与命令审计

> Audit date: 2026-07-24 | Auditor: Lead Orchestrator
> Scope: dev→test→fix 流程、package scripts、quality gate、CI、文档漂移

## 1. dev→test→fix 流程真实性

| 文档声称 | 代码现实 | 偏差 |
|----------|----------|------|
| `docs/ai-dev-test-agent.md` 描述的"Agent 双模行为契约" | `src/lib/ai/agentContext.ts` 已定义 `AgentMode`, `TestScope`, `AgentTestReport` 类型 | 类型存在但无强制执行的 runner |
| "Dev 模式修改后自动进入 test 模式" | 无自动化状态机 | **不存在** |
| "Test 模式发现问题后自动进入 dev 模式修复" | 无自动回环逻辑 | **不存在** |
| "循环直到 test 模式全部通过" | 无循环控制器 | **不存在** |
| "不可跳过的硬门：eslint、test:unit、build" | `test:ci` 确实跑这三个 | 存在但只是脚本集合，非 agent 工作流 |

**结论：dev→test→fix 作为概念存在于文档，作为自动化强制机制完全不存在。**

当前实际流程：开发者手动改代码 → 手动跑 lint/test/build（可选）→ CI 是唯一强制门。

## 2. Package Scripts 审计

`package.json` 包含约 **100 个 scripts**。

| 问题 | 证据 | 严重程度 |
|------|------|----------|
| 同名功能多入口 | `test:ci` vs `test:gate:ci` 两个不同的 CI 级门 | 中 |
| test:ci 覆盖不全 | 只跑 lint + unit + db:check + build | 高 |
| eval 脚本爆炸 | 10+ eval:* 对应 10+ 独立 tsx 文件 | 中 |
| mock/live 模式分散 | 每个 eval 独立处理 --mode，无统一抽象 | 高 |
| test:gate 与 CI 不重合 | test:gate 有 L1-L8 分层，CI 用 test:ci | 高 |

### 命令成本

| 门级 | 内容 | 预算 |
|------|------|------|
| L1 Lint | eslint | 60s |
| L2 Unit | tsx --test | 120s |
| L3 Contracts + Promptfoo | 合同+确定性 | 120s |
| L4 Eval Quality (mock) | 离线评分 | 60s |
| L5 Safety + Red Team (mock) | 安全扫描 | 90s |
| L6 Task Eval + Judge | 离线 | 10s |
| L7 Build | next build | 90s |

完整门禁 ~7-8min，quick 模式 ~2min。无自动风险路由。

## 3. CI 流水线审计

| Job | 触发 | 内容 |
|-----|------|------|
| verify | PR+push | lint+unit+build+admin smoke |
| deterministic-assertions | PR+push | promptfoo mock |
| playthrough-mock | PR+push | 4 personas x3 runs |
| e2e-contract | PR+push | SSE contract |
| offline-evals-fast | PR+push | detector+narrative-style |
| mock-chat-guardrails | nightly only | full mock E2E+benchmark+eval |
| live-chat-perf | nightly only | live gateway benchmark |

### CI 问题

- **PR 门不跑 mock guardrails** — 关键词注入/假绿在 PR 阶段不可见
- **PR 门不跑 narrative safety gate** — 安全回归可能合并后才发现
- **e2e-contract 使用 keys_missing 降级** — 验证降级路径而非真实路径

### CI vs 本地门漂移

| 维度 | CI (test:ci) | 本地 (test:gate) | 重合 |
|------|-------------|-------------------|------|
| Lint | ✅ | ✅ | 一致 |
| Unit | ✅ | ✅ | 一致 |
| Contract | ❌ | ✅ L3 | **不一致** |
| Eval quality | ❌(仅nightly) | ✅ L4 | **不一致** |
| Safety | ❌(仅nightly) | ✅ L5 | **不一致** |

## 4. Quality Gate (`run-quality-gate.ts`)

- 1119 行单体巨型脚本，混合 playthrough 驱动、评分、报告
- 与 CI 无直接连线 — CI 不调用 `eval:quality-gate`
- 依赖运行中的 /api/chat 服务器
- judge 质量依赖未经校准的 AI

## 5. 风险分级测试矩阵建议

| 风险级别 | 快速门 | PR 门 | 发布门 |
|----------|--------|-------|--------|
| L0 文档 | git diff --check | — | — |
| L1 纯函数 | focused unit | lint + unit | lint + unit + contract |
| L2 前端/Store | focused unit + 组件 | unit + contract + e2e smoke | full e2e |
| L3 /api/chat/SSE | focused contract | contract + e2e + mock eval | full e2e + live benchmark |
| L4 prompt/叙事 | — | mock eval + safety | live eval + human review |

## 6. 关键发现

1. **dev→test→fix 自动化闭环不存在** — 类型有，机制无
2. **100 个 npm scripts 缺乏统一编排**
3. **CI PR 门太窄** — contract/eval/safety 不在 PR required
4. **test:gate 和 CI 两套体系不重合**
5. **test:ci 最硬但不最完整** — 仅 L1+L2+构建
6. **quick vs full gate 无自动路由**
7. **quality gate (1119行) 与 CI 无连线**
8. **本地无 pre-commit 保护**
