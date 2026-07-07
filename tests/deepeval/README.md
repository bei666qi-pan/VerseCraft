# VerseCraft DeepEval 集成

> 叙事层评估 — DeepEval ConversationSimulator + GEval

## 目录结构

```text
tests/deepeval/
├── conftest.py                       # pytest 配置（mock 模式默认开启）
├── test_narrative_metrics.py         # 5 维度叙事评分（GEval wrapper）
├── test_conversation_simulator.py    # ConversationSimulator 集成
├── requirements.txt                  # Python 依赖
├── README.md                         # 本文件
└── deepeval-report.json              # 跑完后自动生成
```

## 运行

### Mock 模式（默认；CI / 离线 / 不调 LLM）

```bash
cd /Users/qi/Desktop/项目/VerseCraft
python3 -m pytest tests/deepeval/ -v
```

预期输出：5 个 metric 测试 + 5 个 simulator 测试 + 1 个 calibration 测试 + 1 个 import smoke = 12 个测试。

### 真实模式（需要 OpenAI 兼容 API key）

```bash
cd /Users/qi/Desktop/项目/VerseCraft
pip3 install -r tests/deepeval/requirements.txt

# 设置 API key（DeepSeek / one-api 都兼容）
export DEEPEVAL_MOCK_MODE=0
export OPENAI_API_KEY=sk-xxx
# 可选：自定义 base url
export OPENAI_BASE_URL=https://api.deepseek.com/v1
export DEEPEVAL_MODEL=deepseek-chat

python3 -m pytest tests/deepeval/ -v
```

## 评分维度

| 维度 | 权重 | 硬性底线 | 说明 |
|------|------|---------|------|
| coherence（连贯性） | 20% | ≥ 2 | 前后文逻辑是否自洽 |
| characterVoice（角色口吻） | 20% | ≥ 2 | NPC 说话是否符合人物设定 |
| plotLogic（剧情逻辑） | 20% | ≥ 2 | 因果链是否完整合理 |
| immersion（代入感） | 15% | — | 文本能否让玩家沉浸 |
| factConsistency（事实一致性） | 25% | ≥ 3 | 与已设定事实是否一致 |

完整定义见 `src/lib/evals/deepEval/metrics.ts`。

## ConversationSimulator 多轮指标

DeepEval 官方提供的多轮对话模拟器。我们用它跑 3 个原生指标：

| 指标 | 用途 | mock 实现 |
|------|------|-----------|
| KnowledgeRetentionMetric | 助手是否记得前文事实 | 关键词命中比例 |
| RoleAdherenceMetric | 助手是否保持游戏 DM 角色 | 系统术语泄漏检测 |
| ConversationCompletenessMetric | 助手是否每个 user 都有响应 | user/assistant 数量比 |

## 校准

LLM 裁判有系统性偏见（偏爱长回答、位置偏见等），必须先校准：

1. 人工对校准样本（`src/lib/evals/deepEval/calibration.ts` 40 个种子）打分
2. 用真实模式跑同批样本
3. 计算 Spearman / Pearson 相关性
4. 相关性 ≥ 0.7 后才能用 LLM 分数 gate CI

校准统计由 `computeCalibrationStats()` 提供。

## 与 Node 侧 harness 的关系

| 工具 | 职责 | 频率 |
|------|------|------|
| **playthrough harness**（自建） | 整局模拟 + 双层检查器 | 每次 PR / 每晚定时 |
| **Promptfoo** | 武器/职业 schema/规则单点断言 | 每次 PR |
| **DeepEval**（这里） | 叙事层 5 维度评分 + 多轮指标 | 每晚定时 |
| **人工 playtest** | 乐趣/手感判断 | 低频 |

## 局限

- DeepEval 多轮指标设计目标是 chatbot，不是 agent — 我们仅借用
- mock 模式基于规则的简化评分，不期待强相关性
- 真实模式调用 OpenAI 兼容 API，每次跑分会波动（建议多次取平均）

## 故障排查

```bash
# 1. Python 版本检查
python3 --version  # 应 ≥ 3.8

# 2. deepeval 包检查
python3 -c "import deepeval; print(deepeval.__version__)"

# 3. pytest 检查
python3 -m pytest --version

# 4. 单独跑一个测试
python3 -m pytest tests/deepeval/test_narrative_metrics.py::test_narrative_metric_mock -v
```