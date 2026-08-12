# 测试通过但产品不可用：排障与发布验收

自动测试通过只证明被测试的断言成立，不等于真实产品可用。VerseCraft 的发布判断必须同时有契约、渲染和业务结果三层证据。

## 固定处理顺序

1. 用线上或 production preview 的真实浏览器复现完整用户路径，记录 URL、viewport、时间、截图、console/page error、失败文案和 request ID。
2. 沿 request ID 检查 SSE。HTTP 200 只代表传输契约存活；必须继续断言 status 帧、终帧、业务 payload 和可点击结果。
3. 用最小同构请求绕过 UI 直测 `/api/chat`，区分客户端、服务端校验、模型网关和结果解析。
4. 对外部依赖做 live preflight。配置项“存在”不等于服务“可达”；AI 网关必须跑 `pnpm probe:ai-gateway`，Langfuse 必须跑 preflight 与 trace probe。
5. 修复根因后先补一个会在旧代码失败的回归测试，再重跑真实路径。不要降低契约断言或用降级结果冒充正常成功。
6. 发布后在 `versecraft.cn` 再跑同一个 canary；本地通过不能替代部署配置、网络和代理的一致性。

## 发布证据矩阵

| 层级 | 必须证明 | 典型命令 |
| --- | --- | --- |
| 契约 | SSE 类型、status/final、正常与降级分离 | `pnpm test:e2e:contract` |
| 渲染 | 非空 DOM、无 overlay/console error、三个移动断点、单品牌 mark | `pnpm test:e2e:canary` |
| 业务 | 开场展开后得到 2–4 个 enabled 模型选项 | `E2E_AI_LIVE=1 pnpm test:e2e:canary` |
| AI 外部依赖 | 网关真实可达并返回 token | `pnpm probe:ai-gateway -- --runs 1 --role control` |
| 观测 | Langfuse healthy，trace/score 可 flush | `pnpm langfuse:preflight && pnpm test:langfuse:trace` |
| RAG 质量 | precision/recall 与 live judge 指标有来源、有阈值、有 unavailable 状态 | `pnpm eval:ragas` / `pnpm eval:ragas:live` |

mock canary 只能证明 UI 和协议接线，不得标记为 live 产品就绪。live judge、网关或 Langfuse 不可用时必须显示 blocked/unavailable，不能用 mock 分数填充。

本地 production preview 与 Playwright/benchmark 进程必须显式使用相同的 rollout 配置；测试进程不会自动继承 Next.js 从 `.env.local` 读取的所有非 AI 变量。例如本机当前配置需要同时为 preview 和测试命令设置 `VERSECRAFT_DEFER_MAIN_TURN_OPTIONS_TO_CLIENT=false`。本机启用了 HTTP 代理时，还必须设置 `NO_PROXY=localhost,127.0.0.1,::1`（以及同值的 `no_proxy`），否则 localhost 探针可能被代理成 502，形成错误诊断。

## 本次事故对应检查

- Logo：每个 header 品牌容器恰好一个 `[data-testid="versecraft-brand-mark"]`，同时保留截图检查缩放/GPU 重影。
- 行动选项：options-only 请求必须带明确 meta user message；开场没有历史玩家动作仍有效；失败显示重试、手动输入路径和短 request ID。
- 线上异常：先复制 request ID，再检查终帧 `debug_reason_codes`。`player action is empty` 属于语义校验；`CHAIN_EXHAUSTED:NETWORK` 属于网关可达性，两者不能混为一个问题。
- 自修复：评测系统只生成证据、趋势和建议，不自动改代码、提交或部署。
