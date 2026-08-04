# LOOP_DESIGN — 统一开发测试闭环设计

> 综合 D01-D05 全部审计和设计成果 | 2026-07-24

## 核心原则

1. **同一个 AI 开发、测试、修复、复测** — 不存在独立测试 AI
2. **Workflow over Agent** — 确定性状态机，不是自由 agent 协商
3. **结构化证据 > 主观判断** — 退出码、断言数量、截图、API 响应
4. **风险路由** — L0-L4 自动选择验证深度
5. **假绿零容忍** — 存根断言、吞错、fallback 满分、mock 自证一律禁止

## 闭环架构

```
                     ┌─────────────────────┐
                     │   LEAD ORCHESTRATOR │
                     │   拆任务·管依赖·审查  │
                     └──────────┬──────────┘
                                │
              ┌─────────────────┼──────────────────┐
              │                 │                  │
     ┌────────▼──────┐  ┌──────▼───────┐  ┌───────▼────────┐
     │  WORKER A     │  │  WORKER B    │  │  WORKER C      │
     │  UNDERSTAND   │  │  UNDERSTAND  │  │  UNDERSTAND    │
     │  → BASELINE   │  │  → BASELINE  │  │  → BASELINE    │
     │  → RED        │  │  → RED       │  │  → RED         │
     │  → IMPLEMENT  │  │  → IMPLEMENT │  │  → IMPLEMENT   │
     │  → TEST       │  │  → TEST      │  │  → TEST        │
     │  → FIX        │  │  → FIX       │  │  → FIX         │
     │  → HANDOFF    │  │  → HANDOFF   │  │  → HANDOFF     │
     └───────────────┘  └──────────────┘  └───────────────┘
```

## Worker 状态机

```
UNDERSTAND → BASELINE → REPRODUCE/RED → IMPLEMENT
                 ↑                          │
                 │                    ┌──────┴──────┐
                 │                    ▼             ▼
                 │              FOCUSED TEST  ADVERSARIAL
                 │                    │             │
                 │              失败  │        失败 │
                 │                    ▼             ▼
                 └──────────── IMPLEMENT ◄──────────┘
                                      │ 通过
                                      ▼
                                 APP TEST ──失败──► IMPLEMENT
                                      │ 通过
                                      ▼
                                 REGRESSION ──失败──► IMPLEMENT
                                      │ 通过
                                      ▼
                                  HANDOFF
```

## 风险路由

| 改动路径 | Risk | Focused | Adversarial | App Test | Regression |
|----------|------|---------|-------------|----------|------------|
| `docs/**` | L0 | — | — | — | — |
| `src/lib/turnEngine/*` | L3 | unit | 反例+边界 | SSE contract | contract+e2e+mock eval |
| `src/store/*` | L2 | unit | 边界状态 | play e2e | full mobile e2e |
| `src/app/api/chat/*` | L3 | unit | 降级+错误 | SSE e2e | benchmark mock |
| `src/db/*` | L3 | schema | 迁移 | — | db:check |

## 完整性红线

1. 禁止 `assert.ok(true)` 存根断言
2. 禁止永久 `test.skip(true)`
3. 禁止吞错后返回成功
4. 禁止 fallback 到满分
5. 禁止 Mock 自证
6. 禁止未校准 judge 作硬门
7. 禁止修改测试让失败通过
8. 禁止 `|| true` / fallback 及格

## 与现有基础设施的关系

| 现有组件 | 闭环中的角色 |
|----------|-------------|
| `test:ci` | PR 回归门（扩展为包含 contract） |
| `test:gate` | 本地完整门（与 CI 对齐） |
| `test:gate:quick` | 快速迭代门 |
| `agentContext.ts` | Worker 状态追踪类型 |
| `calibration.ts` | Judge 校准（接线到 gate） |
| `provenance.ts` | 实验溯源（强制执行） |
| `benchmark-run.mjs` | 修复降级逻辑 |
| `mockScenarios.ts` | 清除设计时 eval 耦合 |
| `run-quality-gate.ts` | 拆分为模块化 gate runner |
