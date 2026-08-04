# RISK_MATRIX — 风险分级与验证要求

> 综合 LOOP-CONTRACT.md §5 和 AGENTS.md 的不可破坏契约

## 风险等级定义

| 等级 | 定义 | 触发条件 |
|------|------|----------|
| **L0** | 文档、注释、无行为配置说明 | 仅 .md、注释、类型定义、常量调整 |
| **L1** | 纯函数、小范围非关键逻辑 | 新增/修改独立纯函数、parser、validator（无 IO） |
| **L2** | 前端、Zustand、表单、交互与普通 API | UI 组件、store action、表单、非 /api/chat 的 API |
| **L3** | `/api/chat`、SSE、状态提交、存档、数据库、AI 网关 | 核心回合链路、持久化、schema |
| **L4** | Prompt、叙事质量、安全、World Director、关键玩法闭环、发布路径 | system prompt、安全审查、epistemic、npcConsistency |

## 风险矩阵

### L0 — 文档/注释

| 验证项 | 是否必需 | 工具 |
|--------|----------|------|
| 格式校验 | ✅ | `git diff --check` |
| 链接有效性抽查 | 建议 | 手动 |
| 事实准确性 | 建议 | 对照真实代码 |

### L1 — 纯函数

| 验证项 | 是否必需 | 工具 |
|--------|----------|------|
| Focused unit test | ✅ | `tsx --test <file>` |
| 相关模块回归 | ✅ | `tsx --test "src/lib/<module>/**/*.test.ts"` |
| Lint/type | ✅ | `npx eslint .` |

### L2 — 前端/Zustand/表单/普通 API

| 验证项 | 是否必需 | 工具 |
|--------|----------|------|
| L1 全部 | ✅ | 同上 |
| 组件/contract 测试 | ✅ | `tsx --test` + Playwright |
| 真实浏览器验证 | ✅ | Playwright (正常+错误+重复+移动视口) |
| 相关 E2E | ✅ | Playwright |
| 操作后果验证 | ✅ | 不仅检查 DOM，需检查交互后状态 |

### L3 — /api/chat/SSE/数据库

| 验证项 | 是否必需 | 工具 |
|--------|----------|------|
| L2 适用项 | ✅ | 同上 |
| SSE/JSON contract | ✅ | `__VERSECRAFT_STATUS__`, `__VERSECRAFT_FINAL__`, 降级路径 |
| Store/持久化 | ✅ | 重载/迁移验证 |
| Mock benchmark/eval | ✅ | 契约+稳定性信号 |
| 数据库兼容 | ✅ | 迁移、兼容、回滚、analytics 影响说明 |

### L4 — Prompt/叙事/安全/发布

| 验证项 | 是否必需 | 工具 |
|--------|----------|------|
| L3 适用项 | ✅ | 同上 |
| Prompt version/cache | ✅ | packet、epistemic、validator 覆盖 |
| 确定性安全检测 | ✅ | 泄漏/状态因果 |
| 多 persona playthrough | ✅ | mock 模式 |
| 真实模型验证 | 条件 | 仅在授权+凭证+预算允许时 |
| Human review | 建议 | 发布前 |

## 自动路由规则

```
改动文件路径 → 风险级别 → 验证矩阵

src/lib/turnEngine/*        → L1-L3
src/lib/playRealtime/*      → L3
src/app/api/chat/*          → L3
src/store/*                 → L2
src/db/*                    → L3
src/lib/ai/*                → L2-L3
src/lib/evals/*             → L1
e2e/*                       → L2
docs/*                      → L0
src/lib/epistemic/*         → L3-L4
src/lib/npcConsistency/*    → L3-L4
src/lib/security/*          → L3-L4
prompts/*                   → L4
```

## 最低验证时间预算

| 风险级别 | 快速门（本地迭代） | PR 门 | 发布门 |
|----------|---------------------|-------|--------|
| L0 | <5s | — | — |
| L1 | <30s | <2min | <3min |
| L2 | <1min | <5min | <10min |
| L3 | <2min | <10min | <20min |
| L4 | — | <15min | <30min |
