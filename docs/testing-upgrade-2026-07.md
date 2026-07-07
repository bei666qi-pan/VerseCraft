# 测试体系全面升级 (2026-07)

> 基于三件事：Promptfoo 确定性断言、DeepEval 叙事质量裁判、长程 Playthrough 模拟器

## 升级概览

```text
                         ┌──────────────────────────┐
                         │   VerseCraft 测试体系     │
                         └──────────────────────────┘
                                    │
          ┌─────────────────────────┼─────────────────────────┐
          │                         │                         │
  ┌───────▼────────┐     ┌─────────▼──────────┐    ┌─────────▼───────────┐
  │  Promptfoo     │     │  DeepEval +        │    │  Playthrough Sim    │
  │  确定性断言     │     │  LLM-as-Judge      │    │  长程模拟器          │
  │                │     │  叙事质量裁判       │    │                     │
  ├────────────────┤     ├────────────────────┤    ├─────────────────────┤
  │ Schema 校验     │     │ 连贯性 (20%)       │    │ ① Player Agent     │
  │ 规则一致性      │     │ 角色口吻 (20%)     │    │   4 persona        │
  │ 硬断言         │     │ 剧情逻辑 (20%)      │    │ ② 游戏循环          │
  │ 秒级出结果      │     │ 代入感 (15%)       │    │ ③ 双层检查器        │
  │ 免费           │     │ 事实一致性 (25%)    │    │   每步不变量+       │
  │                │     │                     │    │   整局叙事裁判       │
  │ 离线运行        │     │ LLM 裁判 + 校准集   │    │ ④ 编排 harness     │
  └────────────────┘     └─────────────────────┘    └─────────────────────┘
```

## 一、Promptfoo 确定性断言层

### 定位
测试武器/职业的 **数据结构合法性** 和 **规则一致性**。所有断言都是 `contains`/`equals`/自定义函数，不调 LLM，免费且秒出结果。

### 文件结构
```text
promptfooconfig.yaml           ← 主配置（prompts + providers + tests）
tests/promptfoo/
  assertions/
    schema-validators.ts       ← 自定义断言函数
  prompts/
    mock-weapon-response.json  ← 武器 mock 输出
    mock-profession-response.json ← 职业 mock 输出
  tests/
    weapon-schema.yaml         ← 武器 Schema 校验 YAML 测试
    weapon-schema.test.ts      ← 武器 Schema Node 测试
    profession-rules.yaml      ← 职业规则 YAML 测试
    profession-rules.test.ts   ← 职业规则 Node 测试
scripts/run-promptfoo.ts       ← CLI 运行器
```

### 测试覆盖
| 类别 | 测试数 | 断言类型 |
|------|--------|---------|
| 必填字段完整性 | 7 | javascript 函数断言 |
| weapon_updates 结构 | 14 | 范围/枚举/类型校验 |
| options 数组 | 5 | 长度/非空/数组校验 |
| awarded_items | 1 | 必填字段校验 |
| 职业技能排他性 | 3 | 跨技能名检测 |
| excludeSystems 约束 | 5 | 语义违规检测 |
| 冷却时间 | 2 | 技能可用性检测 |
| 叙事安全 | 2 | 泄漏检测 |
| **合计** | **45** | |

### 运行命令
```bash
pnpm test:promptfoo            # Node 内置测试（推荐，离线秒出）
pnpm test:promptfoo:run        # CLI 运行器
pnpm promptfoo eval            # Promptfoo CLI（如果已安装）
```

---

## 二、DeepEval 叙事质量评估

### 定位
用 LLM 裁判对叙事质量进行**分维度可打分**的评估。与现有 `src/lib/evals/judge/` 框架互补：
- `judge/` 做多裁判投票 + 位置随机化
- `deepEval/` 做 DeepEval 原生指标 + 校准集

### 五个评分维度

| 维度 | 权重 | 硬性底线 | 说明 |
|------|------|---------|------|
| coherence（连贯性） | 20% | ≥2 | 前后文逻辑是否自洽 |
| characterVoice（角色口吻） | 20% | ≥2 | NPC 说话是否符合人物设定 |
| plotLogic（剧情逻辑） | 20% | ≥2 | 因果链是否完整合理 |
| immersion（代入感） | 15% | — | 文本能否让玩家沉浸 |
| factConsistency（事实一致性） | 25% | ≥3 | 与已设定事实是否一致（防幻觉） |

### 校准系统
LLM 裁判有系统性偏见（偏爱长回答、位置偏见等），必须先校准：
1. 人工标注 20-50 个样本（种子样本在 `calibration.ts` 中）
2. LLM 裁判打分
3. 计算 Spearman/Pearson 相关系数
4. 确认 r > 0.7 后放大规模

### 文件结构
```text
src/lib/evals/deepEval/
  index.ts               ← 主入口
  metrics.ts              ← 维度定义 + 评分标准
  calibration.ts          ← 校准系统 + 校准样本
scripts/eval-deepeval.ts  ← CLI 运行器
```

### 运行命令
```bash
pnpm dlx tsx scripts/eval-deepeval.ts              # mock 模式
pnpm dlx tsx scripts/eval-deepeval.ts --calibrate   # 校准模式
pnpm dlx tsx scripts/eval-deepeval.ts --mode live   # live 模式
```

---

## 三、长程 Playthrough 模拟器

### 定位
自建薄壳 harness：Player Agent + 游戏循环 + 双层检查器 + 编排。
不做通用框架，只做游戏定制。

### 核心架构

```text
for persona in [speedrunner, explorer, rulebreaker, confused]:
  for seed in range(N):
    state = game.new_session(seed)
    transcript = []
    for step in range(MAX_STEPS):
      action = player_agent.act(persona, transcript, state)
      narrative, state = game.step(action)
      transcript.append((action, narrative, state))

      assert_invariants(state)          # 第一层：不变量（硬断言）
      if is_softlocked(transcript):      # 卡死检测
        report_failure("softlock"); break
      if state.reached_ending:
        break

    judge_narrative_consistency(transcript)  # 第二层：叙事裁判
```

### 四种玩家 Persona

| Persona | 目的 | 最大步数 | 非法操作 |
|---------|------|---------|---------|
| speedrunner（速通） | 测主线流程 | 20 | 否 |
| explorer（探索） | 测边缘分支 | 40 | 否 |
| rulebreaker（破坏） | 测边界/漏洞 | 25 | 是 |
| confused（迷茫） | 测鲁棒性 | 30 | 是 |

### 不变量检查清单（10 条）

1. HP ≥ 0，≤ maxHp
2. 行囊 ≤ 最大槽位
3. 理智值 ≥ 0
4. 原石 ≥ 0
5. 武器 stability ∈ [0, 100]
6. 武器 contamination ∈ [0, 100]
7. 死亡 NPC 不在存活列表
8. 位置合法
9. 章节号 ≥ 0
10. 已完成任务不被回退

### Softlock 检测
连续 N 步（默认 8）无进展 → softlock。
"进展"定义：任务变化、位置变化、物品变化、HP/理智显著变化、图鉴更新、NPC 状态变化、标记解锁。

### 文件结构
```text
src/lib/evals/playthrough/
  index.ts               ← 主入口
  types.ts               ← 核心类型定义
  playerAgent.ts         ← 模拟玩家（4 persona + mock 动作生成器）
  invariants.ts          ← 确定性不变量检查 + softlock 检测
  narrativeJudge.ts      ← 叙事一致性裁判（mock + live）
  orchestrator.ts        ← 主编排器（单局 + 批次）
  playthrough.test.ts    ← 测试（24 个）
scripts/run-playthrough.ts ← CLI 运行器
```

### 运行命令
```bash
pnpm test:playthrough                        # 单测
pnpm test:playthrough:run                    # CLI 运行（所有 persona, mock）
pnpm dlx tsx scripts/run-playthrough.ts --persona speedrunner --runs 5
pnpm dlx tsx scripts/run-playthrough.ts --json-out report.json
```

### 覆盖矩阵

| Persona | Happy Path | Recovery Path | Refusal Path | Abandonment |
|---------|-----------|---------------|--------------|-------------|
| speedrunner | ✓ 主线速通 | — | — | ✓ 步数上限 |
| explorer | ✓ 探索通关 | ✓ 迷路后找回 | — | ✓ 软卡死 |
| rulebreaker | — | ✓ 非法后回退 | ✓ 规则拒绝 | ✓ 违反不变量 |
| confused | — | ✓ 困惑后回归 | ✓ 无效输入 | ✓ 步数耗尽 |

### 诚实局限
> LLM 模拟的用户是真实人类的不可靠替身（《Lost in Simulation》, 2026）。
>
> **擅长**：大规模覆盖、回归测试、逮机械 bug 和一致性崩坏（状态非法、剧情矛盾、softlock）
> **不擅长**：替代人工 UAT、预测真实用户行为分布

---

## 四、CI 集成

### 新增 package.json 命令

```json
{
  "test:promptfoo": "tsx --test tests/promptfoo/tests/*.test.ts",
  "test:promptfoo:run": "tsx scripts/run-promptfoo.ts",
  "test:deepeval": "tsx --test src/lib/evals/deepEval/*.test.ts",
  "test:playthrough": "tsx --test src/lib/evals/playthrough/playthrough.test.ts",
  "test:playthrough:run": "tsx scripts/run-playthrough.ts"
}
```

### 推荐 CI 分层

```yaml
# .github/workflows/ 可新增：
#
# deterministic-assertions:
#   运行: pnpm test:promptfoo（秒级，免费）
#   触发: 每个 PR
#
# playthrough-mock:
#   运行: pnpm test:playthrough（~1s，mock 模式）
#   触发: 每个 PR
#
# deep-eval-gate:
#   运行: pnpm dlx tsx scripts/eval-deepeval.ts --calibrate
#
# 后续可添加 live 模式 job（需要真实 AI 网关）
```

### test-gate 扩展
在 `scripts/test-gate.mjs` 的层级中可新增：

```text
L8: Promptfoo 确定性断言  → pnpm test:promptfoo
L9: Playthrough 模拟器    → pnpm test:playthrough
```

---

## 五、与其他测试层的关系

| 层级 | 工具 | 速度 | 成本 | 覆盖 |
|------|------|------|------|------|
| L1-L2: 单元/契约 | node:test | ms | 免费 | 纯函数/游戏逻辑 |
| **新增: Promptfoo** | node:test | ms | 免费 | Schema/规则一致性 |
| L4-L6: Eval 质量 | eval scripts | ~1s | mock模式免费 | 叙事质量/安全 |
| **新增: DeepEval** | 校准+裁判 | ~1s(校准)/~10s(裁判) | LLM调用 | 分维度叙事打分 |
| **新增: Playthrough** | 自建harness | ~1s(10步mock) | mock模式免费 | 端到端状态一致性 |
| L7: 构建 | next build | ~60s | 免费 | 全量编译 |
| E2E: Playwright | Playwright | ~30s | 免费 | 浏览器UI契约 |

---

## 六、下一步

1. **补充校准样本**：将 `CALIBRATION_SEEDS` 从 8 个扩展到 30-50 个人工标注样本
2. **接入 Live 模式**：Playthrough 的 live 模式需要真实 AI 网关
3. **CI 集成**：在 `.github/workflows/ci.yml` 中新增 deterministic 和 playthrough job
4. **历史基线**：在 `benchmarks/suite.json` 中记录 playthrough pass rate 基线
5. **夜间定时跑**：用 `pnpm test:playthrough:run --runs 5` 配 cron 定时跑
