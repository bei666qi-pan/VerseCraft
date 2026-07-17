# Live 评测低成本执行策略

## 目标

Live 评测只验证 mock 无法覆盖的真实模型行为：尾延迟、叙事质量、结构化输出稳定性和跨回合一致性。确定性契约、纯 validator 与大规模 fuzz 继续在 mock 层完成。

## 推荐分层

| 层级 | 命令 | 调用规模 | 使用时机 |
|---|---|---:|---|
| Mock 全量 | `pnpm test:evals` | 0 | 每次 PR |
| Live smoke | `pnpm eval:playthrough:live:smoke` | 最多 16 个 DM 回合 | 模型、prompt、路由变更后 |
| Live standard | `pnpm eval:playthrough:live:standard` | 最多 45 个 DM 回合 | main / nightly |
| Live deep | `pnpm eval:playthrough:live -- --live --profile deep --max-live-calls 150` | 最多 150 个 DM 回合 | 发布前或人工触发 |

默认单次 live 上限为 60 次。Deep 档必须显式提高 `--max-live-calls`，避免误操作产生大额调用。

## 成本与真实性口径

- `live_full` 才计入真实 live 通过率。
- `live_degraded` 必须单列，不能用 mock fallback 的结果替代 live 成功。
- Judge 输出标记为 `live`、`mock` 或 `fallback`。
- Playtest LLM 每日默认预算为 300 次，可通过 `VERSECRAFT_EVAL_DAILY_CALL_BUDGET` 调低或显式调高。
- `402` 属于余额或计费硬失败，立即停止，不重试。
- `429`、`503` 和空响应最多短重试两次。
- Player agent 与 LLM judge 使用内容寻址缓存；模型、输入、温度或 token 上限变化会自动失效。可用 `VERSECRAFT_EVAL_DISABLE_CACHE=1` 强制重跑。
- Stateful DM 回合不做结果缓存，避免缓存污染跨回合状态；只缓存无副作用的评测模型调用。
- 首个 `degraded` 会话不再默认终止全量批次；默认策略建议继续跑完剩余会话并记录 degraded 比例，尽快补齐证据。
- 排障或平台异常时，可加 `--stop-on-degrade` 做快速止损。
- 裁判采用 deterministic-first：结构、重复、状态矛盾和安全规则已经失败时，不再调用 LLM judge；只有通过基础门禁的文本才进入语义质量裁判。疑难复核可设置 `VERSECRAFT_EVAL_FORCE_LIVE_JUDGE=1`。
- 报告会给出通过率 95% 置信区间；当区间宽度>35pp 时，建议再补齐到脚本建议会话总数（默认目标 5% 半宽）后再做发布判定。

## 推荐执行顺序

1. 运行 unit、contract、detector 和 mock fuzz。
2. 仅在这些门禁通过后运行 live smoke。
3. smoke 失败时保留 request/session/turn 证据，不继续扩大样本。
4. smoke 通过后才运行 standard；deep 仅用于发布决策或疑难问题复现。

这种漏斗能让真实模型预算集中到 mock 无法判断的问题，而不是重复支付确定性检查成本。

## mock 与 live 裁判：准确性边界

- mock 裁判擅长“结构化错误”检测（字段缺失、重复文本、状态跃迁可复现问题、简单矛盾关键词），适合做高频回归。
- live 裁判擅长“语义合理性”判断（叙事一致性、隐含因果、角色一致性、叙事收束），是发布前与疑难复盘的关键门。
- 对重要上线前版本，建议至少跑一次：
  - `--compare-judge`（mock 与 live 并行打分）；
  - 观察 `Pass 一致率`、`平均分差`、以及 `Pass 不一致会话` 是否可接受；
  - 若出现 `mock 通过但 live 失败` 的边界，默认优先依赖人工复核。
- 可以把“你来当裁判”理解为：我对对账文件中的关键不一致样本做二次阅读确认，不替代自动化链路，但可在时间紧时快速筛掉明显误判。

### 一键质量闸道（建议）

```bash
# codex/live 场景默认要求 raw AI/Codex 原始置信（如果没有显式关闭，则缺失会导致闸道失败）
pnpm eval:quality-gate --judge-mode codex --sessions 2 --steps 8 --out .runtime-data/eval/quality-gate-codex-smoke
pnpm eval:quality-gate --live --judge-mode codex --sessions 1 --steps 8 --out .runtime-data/eval/quality-gate-live
pnpm eval:quality-gate --live --compare-judge --judge-mode auto --sessions 2 --steps 12 --out .runtime-data/eval/quality-gate-live-compare
pnpm eval:quality-gate --live --parallel 3 --continue-on-degrade --judge-mode codex --sessions 4 --steps 8 --out .runtime-data/eval/quality-gate-codex-live-parallel

# 强约束：拒绝纯启发式置信，发布前优先要求有 raw_ai（Model/Codex）来源
pnpm eval:quality-gate --judge-mode codex --sessions 1 --steps 6 \
  --enforce-confidence --min-confidence 0.7 --require-confidence-source raw_ai

# 强约束成本闸门：避免只看最终分值，绑定真实 token 证据与每回合成本上限
pnpm eval:quality-gate --judge-mode codex --sessions 1 --steps 6 \
  --enforce-confidence --min-confidence 0.7 --require-confidence-source raw_ai \
  --enforce-cost --max-cost-equivalent 12000 --max-cost-per-turn 1800 --max-input-tokens 120000 --max-output-tokens 10000

# 强约束缺陷闸门：把“当前样本有可复现实缺陷”视为真实阻断
pnpm eval:quality-gate --judge-mode codex --sessions 1 --steps 6 \
  --enforce-confidence --min-confidence 0.7 --require-confidence-source raw_ai \
  --enforce-cost --max-cost-equivalent 12000 --max-cost-per-turn 1800 --max-input-tokens 120000 --max-output-tokens 10000 \
  --enforce-bug-gate --max-critical-bugs 0 --max-major-bugs 0 --max-minor-bugs 24 --max-actionable-bugs-per-100-turns 2
```

> 提示：如需做探索性分析、允许 no-raw 置信继续出报告，可通过
> `VERSECRAFT_EVAL_AUTO_REQUIRE_RAW_AI_CONFIDENCE=0` 临时关闭默认自动启用的置信约束，
> 但发布链路请保持默认行为，避免“伪置信”参与决策。

该命令会自动落地：

- `live-playthrough-report.md`（会话结论、指标和关键 bug 触发）
- `traces/`（每回合 transport 与 _eval_metrics）
- `product-quality/product-quality.json` / `product-quality.md`（量化评分、代价、可玩性代理与功能门禁）
- `next-feature-tests.json`（下一周期优先级测试计划）
