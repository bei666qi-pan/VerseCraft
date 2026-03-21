# 多模型架构总览（与代码对齐）

本文档是 **`docs/ai-architecture.md`** 的导航页，面向上线验收与维护；细节以 `src/lib/ai` 源码为准。

## 必读索引

| 主题 | 文档 |
|------|------|
| 目录职责、入口 API | `docs/ai-architecture.md` |
| 熔断 / fallback 状态机 | `docs/ai-fallback.md` |
| 成本、缓存、门控、预算 | `docs/ai-governance.md` |
| 环境变量约定 | `docs/environment.md` |
| 本地运行 | `docs/local-development.md` |
| Coolify 部署 | `docs/deployment-coolify.md` |
| 人工回归步骤 | `docs/regression-checklist.md` |
| 上线前验收结论 | `docs/ACCEPTANCE-PRE-RELEASE.md` |
| AI 故障排查 | `docs/troubleshooting-ai.md` |
| 扩展模型/任务 | `docs/ai-extensibility.md` |

## 模型分工（摘要）

| 逻辑模型 | 厂商 | 典型任务 |
|----------|------|----------|
| `deepseek-v3.2` | DeepSeek | 玩家主叙事 `PLAYER_CHAT`、规则/战斗 JSON 任务 |
| `glm-5-air` | 智谱 | 控制面预检、意图、安全预筛；部分 fallback |
| `MiniMax-M2.7-highspeed` | MiniMax | **仅** `SCENE_ENHANCEMENT` / `NPC_EMOTION_POLISH`（门控 + 预算） |
| `deepseek-reasoner` | DeepSeek | **仅**离线/后台：`WORLDBUILD_OFFLINE`、`STORYLINE_SIMULATION`、`DEV_ASSIST` 等；**禁止**进入 `PLAYER_CHAT` 链 |

权威映射表由 `tasks/taskPolicy.ts` 的 `TASK_POLICY` / `TASK_MODEL_FORBIDDEN` 定义；可运行 `exportTaskModelMatrixMarkdown()` 导出 Markdown（见 `service.ts` / 路由调试）。

## 自动化测试

```bash
pnpm test:unit
pnpm test:e2e:chat
```

覆盖：配置校验、`registry` 白名单、`taskPolicy` 链路与禁止表、失败分类、OpenAI 形态流式解析、各 `providers` 请求体构造、环境解析、`enhancementRules` 纯函数门控、**mock 503 的玩家流式 fallback**；E2E 校验 `/api/chat` SSE 传输契约。

扩展约定见 **`docs/ai-extensibility.md`**。
