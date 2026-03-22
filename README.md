# 文界工坊 (VerseCraft)

基于大模型驱动的单机规则怪谈游戏。你将在如月公寓中扮演一名意识潜入者，在 7 层诡异与地下出口之间求生，对抗理智侵蚀，探寻唯一的逃生之路。

## 项目简介

VerseCraft 是一款融合 **规则怪谈** 与 **RPG 属性检定** 的文本冒险游戏。玩家创建角色、分配属性、选择回响天赋后进入公寓，通过简短的动作指令与 AI 地下城主（DM）交互。DM 经 **one-api 网关** 调用大模型，进行双阶段推理：先校验动作合法性，再根据世界观与属性暗骰推进剧情；具体上游由环境变量 `AI_MODEL_*` 在网关中映射。游戏没有安全退出——离开即死亡，只有通关或死亡才能离开。

## 技术架构

| 层级 | 技术 |
|------|------|
| 框架 | Next.js 16 (App Router), React 19 |
| 样式 | Tailwind CSS v4 |
| 状态 | Zustand（持久化到 IndexedDB） |
| AI 推理 | **统一 one-api（OpenAI 兼容）**；应用内按逻辑角色 `main` / `control` / `enhance` / `reasoner` 路由（详见 `docs/ai-gateway.md`） |

- **前端**：单页流程，无路由跳转的背包、属性面板、叙事视窗。
- **后端**：`/api/chat` 流式 SSE；网关与切模型见 `docs/ai-gateway.md`，总览见 `docs/ai-multi-model-overview.md`。
- **持久化**：idb-keyval + Zustand persist，跨会话保存角色、背包、日志。

## 环境变量

- 模板：根目录 `.env.example` → 本地复制为 **`.env.local`**（勿提交）。
- 生产：**Coolify** 面板填写与模板**同名**变量即可，无需改代码。
- 读取规范：服务端用 `@/lib/config/serverConfig` 与 `@/lib/ai/config/env`；禁止在 `src/` 散落 `process.env`；浏览器仅 `NEXT_PUBLIC_*`（见 `docs/environment.md`）。

## 当前架构约定（统一后）

- **单一主 store**：仅保留 `src/store/useGameStore.ts`，不再存在 `src/store/gameStore.ts` 双 store 架构。
- **显式 stream phase**：`/play` 交互锁与流式视觉由显式阶段机驱动（`idle` / `waiting_upstream` / `streaming_body` / `turn_committing` / `error`）。
- **开场策略**：开场仅走主链路请求；仅当超时且无助手叙事时触发本地降级注入，避免与 SSE 抢写。
- **注册会话**：注册成功后由服务端建立会话，客户端按已登录态承接流程，不再依赖“前端自动登录补丁”。
- **文档同步原则**：新增功能或重构后需同步更新 `.cursorrules`、`README`、`AGENTS.md`，确保规则与真实代码一致。

## 核心玩法

### 属性与检定

- **理智**：生命值，归零即死亡。遭遇诡异或错误选择会快速下降。
- **敏捷 / 幸运 / 魅力 / 出身**：影响战斗、逃脱、收益事件与开局道具品质。
- 属性面板采用双层弥散光影能量条（0–25、26–50），理智 ≤ 3 时触发红色濒死警示。

### 时间流逝与暗月终焉

- 每次**有效动作**推进 1 小时；**使用道具**不消耗时间（Free Action）。
- 第 3 日至第 9 日：暗月期间，视觉与叙事进入高危氛围。
- 第 10 日：一切终焉，强制结算。

### 无路由背包系统

- 右下角悬浮圆形背包入口，点击打开居中 6 格 Modal。
- 空槽显示暗色凹槽，有物品的槽位可点击查看描述与「使用」。
- 使用道具时，前端将「我使用了道具：[名称]」发送给 DM，由 DM 判定是否生效、是否扣除。

### 退出即死亡

- 无安全退出。浏览器返回键被拦截并提示「只能通过死亡或通关离开」。
- 右上角「放弃挣扎」按钮弹出确认框，确认后将理智设为 0，触发 Game Over 并跳转结算页。

## 快速开始（本地开发）

```bash
pnpm install
pnpm dev
```

1) 复制环境变量模板并配置本地值：

```bash
cp .env.example .env.local
```

2) 在 `.env.local` 中填写密钥（仅本地）：

- `DATABASE_URL`
- `REDIS_URL`
- `AUTH_SECRET`
- `ADMIN_PASSWORD`
- `ALTCHA_HMAC_KEY`
- `AI_GATEWAY_BASE_URL`、`AI_GATEWAY_API_KEY`、`AI_MODEL_MAIN`（及 `AI_MODEL_CONTROL` / `AI_MODEL_ENHANCE` / `AI_MODEL_REASONER`，见 `.env.example`）

本地开发默认端口为 **666**（见 `package.json` 的 `pnpm dev`）。访问 [http://localhost:666](http://localhost:666)，进入「铸造角色」创建角色后即可开始游戏。

### 提交与部署（跨平台）

- 使用 **`pnpm run ship -- "feat: 说明"`**（内部为 `node deploy.sh`）。请勿执行 `bash ./deploy.sh`：`deploy.sh` 为 Node 脚本，在仅 PowerShell/cmd 的 Windows 环境会报错。也请勿使用裸命令 **`pnpm deploy`**（会与 pnpm 内置 `deploy` 子命令冲突）；应使用 **`pnpm run ship`**。

## 部署（Coolify 优先）

- Coolify 中通过 **Environment Variables 面板** 配置所有密码、密钥与连接串。
- 不要把 `.env.local` 上传到服务器。
- 推荐构建/启动配置：
  - Build Command: `pnpm install --frozen-lockfile && pnpm build`
  - Start Command: `pnpm start`
  - Port: `3000`
  - Health Check Path: `/api/health`

详细说明见 `docs/deployment-coolify.md` 与 `docs/local-development.md`。

## 单元测试（AI 路由 / 配置）

```bash
pnpm test:unit
```

## 后台质量回归

- 后台指标与 AI 洞察维护文档：`docs/admin-analytics-maintenance.md`
- 后台接口集成测试：`pnpm test:admin:api`
- 后台平滑性回归：`pnpm test:admin:perf`
- 后台 SQL 执行计划基线：`pnpm analyze:admin-sql`
- 严格门槛（CI 推荐）：`pnpm analyze:admin-sql:strict`

## 项目结构

```
src/
├── app/           # Next.js App Router 页面
│   ├── play/      # 意识潜入主界面
│   ├── create/    # 角色创建
│   ├── settlement/# 结算
│   └── api/chat/  # DM 流式 API
├── store/         # Zustand 状态机
├── lib/registry/  # 物品、NPC、诡异、规则
└── components/    # 全局组件
```

## License

Private.
