# 文界工坊 (VerseCraft)

基于大模型驱动的单机规则怪谈游戏。你将在如月公寓中扮演一名意识潜入者，在 7 层诡异与地下出口之间求生，对抗理智侵蚀，探寻唯一的逃生之路。

## 项目简介

VerseCraft 是一款融合 **规则怪谈** 与 **RPG 属性检定** 的文本冒险游戏。玩家创建角色、分配属性、选择回响天赋后进入公寓，通过简短的动作指令与 AI 地下城主（DM）交互。DM 基于火山引擎 DeepSeek V3.2 进行双阶段推理：先校验动作合法性，再根据世界观与属性暗骰推进剧情。游戏没有安全退出——离开即死亡，只有通关或死亡才能离开。

## 技术架构

| 层级 | 技术 |
|------|------|
| 框架 | Next.js 16 (App Router), React 19 |
| 样式 | Tailwind CSS v4 |
| 状态 | Zustand（持久化到 IndexedDB） |
| AI 推理 | 火山引擎 DeepSeek V3.2 双阶段推理引擎 |

- **前端**：单页流程，无路由跳转的背包、属性面板、叙事视窗。
- **后端**：`/api/chat` 流式 SSE，接收玩家动作与状态切片，返回 JSON 格式的 DM 判定（`is_action_legal`, `sanity_damage`, `narrative`, `is_death`）。
- **持久化**：idb-keyval + Zustand persist，跨会话保存角色、背包、日志。

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

## 快速开始

```bash
pnpm install
pnpm dev
```

配置 `.env.local`：

```
VOLCENGINE_API_KEY=your_api_key
VOLCENGINE_ENDPOINT_ID=your_endpoint_id
# 或使用 DEEPSEEK_API_KEY 等兼容变量
```

访问 [http://localhost:3000](http://localhost:3000)，进入「铸造角色」创建角色后即可开始游戏。

## Docker 部署

```bash
docker build -t versecraft:v1 .
docker run -d --name versecraft-prod -p 3000:3000 -e HOSTNAME="0.0.0.0" -e PORT="3000" --env-file .env.local --restart unless-stopped versecraft:v1
```

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
