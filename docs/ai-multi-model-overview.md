# 多模型架构总览（与代码对齐）

本文档是 **`docs/ai-architecture.md`** 的导航页；**网关与切模型**以 **`docs/ai-gateway.md`** 为准。

## 必读索引

| 主题 | 文档 |
|------|------|
| **one-api 网关、环境变量、切模型** | **`docs/ai-gateway.md`** |
| 目录职责、入口 API | `docs/ai-architecture.md` |
| 熔断 / fallback 状态机 | `docs/ai-fallback.md` |
| 成本、缓存、门控、预算 | `docs/ai-governance.md` |
| 环境变量约定 | `docs/environment.md` |
| 本地运行 | `docs/local-development.md` |
| Coolify 部署 | `docs/deployment-coolify.md` |
| 人工回归步骤 | `docs/regression-checklist.md` |
| 上线前验收结论 | `docs/ACCEPTANCE-PRE-RELEASE.md` |
| AI 故障排查 | `docs/troubleshooting-ai.md` |
| 扩展任务 | `docs/ai-extensibility.md` |

## 逻辑角色分工（摘要）

真实上游由 **one-api** + 环境变量 `AI_MODEL_*` 决定；应用内只使用下列 **角色**：

> Phase 1（稳态过渡）：生产仅需 3 个实际部署名 `vc-main` / `vc-control` / `vc-reasoner`；`enhance` 逻辑角色保留，但默认映射到 `vc-main`，且增强触发默认关闭。

| 逻辑角色 | 典型任务 |
|----------|----------|
| `main` | 玩家主叙事 `PLAYER_CHAT`、规则/战斗 JSON 类 |
| `control` | 控制面预检、意图、安全预筛；玩家链 fallback |
| `enhance` | **仅** `SCENE_ENHANCEMENT` / `NPC_EMOTION_POLISH`（门控 + 预算） |
| `reasoner` | **仅**离线/后台：`WORLDBUILD_OFFLINE`、`STORYLINE_SIMULATION`、`DEV_ASSIST` 等；**禁止**进入 `PLAYER_CHAT` 链 |

权威映射由 `tasks/taskPolicy.ts` 的 `TASK_POLICY` / `TASK_ROLE_FORBIDDEN` 定义；可运行 `exportTaskModelMatrixMarkdown()` 导出 Markdown。

## 自动化测试

```bash
pnpm test:unit
pnpm verify:ai-gateway
pnpm test:e2e:chat
```

覆盖：网关 env 解析、`taskPolicy` 链路与禁止表、OpenAI 形态流式、**503 玩家流式 fallback**、**网关契约**（链耗尽、`AI_MODEL_MAIN` 注入请求体、本地/生产 URL 归一化）；E2E 校验 `/api/chat` SSE 契约（需可访问网关）。

扩展约定见 **`docs/ai-extensibility.md`**。
