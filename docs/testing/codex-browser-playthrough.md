# Codex 外部玩家游玩测试

该流程让 Codex 充当玩家决策者。浏览器、`/api/chat`、DM 与后台导演仍走 VerseCraft 正常路径；Codex 只读取每回合的玩家可见 observation，并通过本地文件提交下一步行动。

## 两种模式

- **开发者模式**：当前项目 Codex 可结合仓库主动找边界 bug、尝试游戏内异常操作，并以 observation 为玩家当下事实。
- **盲测玩家模式**：每局新建一个 projectless Codex task，只传该局逐回合的 observation JSON 和玩家决策指令；它没有仓库、request/decision 文件路径、SSE final、trace、store 或调试日志。该 task 的唯一历史是本局此前收到的玩家可见 observation，因此能像真人一样记住剧情，但不会获得工程知识。父测试器负责把它的 action 写回握手文件。

在本 Codex task 中可直接说：

- `开始开发者模式游玩测试`
- `开始盲测玩家模式游玩测试`

前者由当前 Codex 决策；后者为每局创建一个隔离的新 Codex task。两者都遵守下文的真网关前置条件。

## 前置条件

1. 使用独立的本地/预发环境，不要对生产账号或生产配额做长程 playtest。
2. 在 `/saiduhsa` → “AI 管理”添加真实服务、模型和“玩家故事生成”候选，并确认测试成功。
3. 可选但推荐：先运行一次 `pnpm benchmark:chat:mock` 确认本地契约环境正常。

## 启动一局

在一个终端运行：

```bash
E2E_AI_LIVE=1 E2E_CODEX_PLAYTEST=1 E2E_CODEX_MAX_TURNS=20 pnpm test:e2e:codex-playthrough
```

开发者模式是默认值；显式指定为：

```bash
E2E_AI_LIVE=1 E2E_CODEX_PLAYTEST=1 E2E_CODEX_PLAYTEST_MODE=developer pnpm test:e2e:codex-playthrough
```

盲测玩家模式由父 Codex task 启动，不把 request 路径交给盲测 task：

```bash
E2E_AI_LIVE=1 E2E_CODEX_PLAYTEST=1 E2E_CODEX_PLAYTEST_MODE=blind pnpm test:e2e:codex-playthrough
```

测试会输出当前 `request.json` 的绝对路径，并在每回合等待。每局文件位于 `.runtime-data/browser-playthrough/<run-id>.codex-handoff/`。

### 开发者模式的决策

将下面的任务交给当前项目 Codex：

> 读取 request.json 的 `observation`，只基于其中玩家可见内容决定下一步自然语言行动。不要读取 store、IndexedDB、prompt、系统消息或 API 内部数据；只给一个简短 intent，不输出思维链。随后运行决策提交命令。

Codex 做出决定后运行：

```bash
pnpm codex:playthrough:decide -- --request <request.json绝对路径> --action "检查走廊尽头的灯" --intent "explore"
```

每回合重复一次。要正常结束本局而不再提交行动：

```bash
pnpm codex:playthrough:decide -- --request <request.json绝对路径> --stop --intent "player_stops"
```

### 盲测玩家模式的决策

父测试器读取 request，但**不得**把 request 路径交给盲测 task。每局开始时，父测试器创建一个新的 projectless Codex task；每次 request 出现时，只向该 task 发送以下内容：

```text
你是第一次游玩这款互动叙事游戏的玩家。只根据以下 observation JSON 决定下一步自然语言行动。
不要寻找或要求任何其他信息；不要解释思维过程。只返回一个 JSON 对象：
{"action":"...","intent":"...","stop":false}

<当前 observation JSON>
```

父测试器读取该 task 的 JSON 回答、校验 action/intent/stop 后，再用上面的 `pnpm codex:playthrough:decide` 命令写回。该 task 在本局结束后即结束；下一局必须新建 task。

## 协议与证据

- `request.json` 含 `protocolVersion`、`runId`、`turnIndex`、随机 `ticket` 和玩家可见 observation。
- CLI 读取 request 后原子写入同目录 `decision.json`；driver 只接受四项身份全部匹配的决定，陈旧文件不会被提交。
- 未在 `E2E_CODEX_HANDOFF_TIMEOUT_MS`（默认 10 分钟）内收到有效决定时，本局失败并保存 trace。
- 每回合的截图、权威 SSE final 与动作记录在 `.runtime-data/browser-playthrough/<run-id>.json`，可用同一动作复跑。

## 先验证握手，不花真网关费用

```bash
tsx --test e2e/support/codexFileHandoff.test.ts
```

如需浏览器 + mock DM 的完整握手冒烟，先以 `AI_PROVIDER=mock` 启动独立服务，再运行：

```bash
E2E_CODEX_HANDOFF_SMOKE=1 pnpm exec playwright test e2e/codex-file-handoff.spec.ts
```
