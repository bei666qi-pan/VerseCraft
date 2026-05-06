# Chat Quality Eval

性能 benchmark 只能证明“够快”，不能证明“叙事和选项仍可用”。`pnpm eval:chat-quality` 是独立质量回归门禁，用固定数据集验证 narrative、options、泄露、SSE contract 和延迟预算。

数据集：

- `benchmarks/llm-evals/cases.json`
- 每个 case 声明 `minNarrativeChars`、`maxNarrativeChars`、`optionsCount`、`mustContainAny`、`mustNotContain`。
- 新增场景时必须先写 eval case，再改 prompt 或生成链路。
- 普通探索 case 禁止凭空出现未建立的人名；需要 NPC 时必须在输入或 `playerContext` 中明确声明。

运行：

```bash
AI_PROVIDER=mock pnpm eval:chat-quality -- --mode mock --assert --json-out .runtime-data/eval-chat-quality-mock.json
E2E_AI_LIVE=1 pnpm eval:chat-quality -- --mode live --assert --json-out .runtime-data/eval-chat-quality-live.json
```

门禁：

- `jsonPassRate = 1`
- `narrativePassRate >= 0.95`，且引号外 narrative 不得用第二人称旁白叙述玩家动作，必须保持第一人称沉浸。
- `optionsPassRate >= 0.98`
- `optionQualityPassRate >= 0.95`
- `leakagePassRate = 1`
- `severeErrorCount = 0`

评分代码在 `src/lib/evals/chatQualityRubric.ts`。当前不强依赖 LLM-as-a-judge；后续若启用 `VC_EVAL_LLM_JUDGE=1`，judge 只能按固定 rubric 打分，不能自由发挥。

生产 trace 回流方式：

1. 从 `chat_request_finished` / `chatGenerationMetrics` 找到失败形态：叙事过短、options 质量失败、long gap、final parse 失败、fallback 触发。
2. 去除原始用户输入和完整 narrative，只保留匿名化复现上下文。
3. 加入 `benchmarks/llm-evals/cases.json`。
4. 跑 mock eval 保证 contract，再在有 secrets 的 nightly/live eval 对真实 gateway 验证。

禁止把 P0/P1 质量失败包装成“后续建议”。如果 eval gate 失败，必须修 prompt、repair、parser、quality gate 或预算配置。
