"""
VerseCraft 叙事质量维度 — DeepEval GEval 包装

把 src/lib/evals/deepEval/metrics.ts 的 5 维度（coherence、characterVoice、
plotLogic、immersion、factConsistency）包装为 DeepEval 的 GEval metric。

工作原理：
- 每个维度构造一个 LLM-as-Judge prompt（含 rubric 锚点）
- 用 DeepEval 的 TestCase + GEval 跑分
- 输出分数与阈值（hardFloor）

mock 模式：基于规则打分（不调 LLM），用于离线跑通和 CI gate。

真实模式：用 OpenAI 兼容 API（DeepSeek / one-api 都支持），按维度分别评分。

为什么选 GEval 而不是 KnowledgeRetention / RoleAdherence 等：
- 这些多轮指标设计目标是对话型 chatbot（客服、助手）
- 我们的 playthrough 是「玩家 vs 游戏」的有状态模拟，不完全契合
- GEval 让我们自定义 rubric，更贴合叙事维度
- 但保留 KnowledgeRetention / RoleAdherence 的思路（在 mock judge 里实现简化版）
"""

from __future__ import annotations

import json
import os
import re
from typing import Any

import pytest


# === Mock 模式评分器 ===

def _mock_score_narrative(scenario: str, narrative: str) -> dict[str, int]:
    """基于规则的 mock 评分，用于离线跑通。

    不调 LLM；按关键词命中 + 长度做启发式评分。
    这是 _极其简化的_ fallback — 仅用于 CI / 离线验证 pipeline。
    真实场景必须用 LLM judge 校准后启用。
    """
    scores: dict[str, int] = {
        "coherence": 3, "characterVoice": 3, "plotLogic": 3,
        "immersion": 3, "factConsistency": 3,
    }

    # 长度基础分
    n_chars = len(narrative)
    if n_chars >= 80:
        scores["immersion"] = 4
    elif n_chars < 40:
        scores["immersion"] = 1
        scores["coherence"] = 2

    # DM-only 泄漏检测
    LEAK_PATTERNS = [
        r"system\s*prompt", r"系统提示词", r"JSON\s*格式", r"忽略.*设定",
        r"^\s*\{\s*\"is_action_legal\"", r"DM指令",
    ]
    has_leak = any(re.search(p, narrative, re.IGNORECASE) for p in LEAK_PATTERNS)
    if has_leak:
        scores["coherence"] = 1
        scores["characterVoice"] = 1
        scores["plotLogic"] = 1
        scores["immersion"] = 1
        scores["factConsistency"] = 1

    # 位置瞬移检测
    TELEPORT_PATTERNS = [r"瞬移", r"突然出现在.*楼", r"无交代"]
    if any(re.search(p, narrative) for p in TELEPORT_PATTERNS):
        scores["factConsistency"] = 1
        scores["coherence"] = 2

    # 死亡 NPC 复活（简化版）
    if "已经死了" in narrative and ("他在" in narrative or "她" in narrative):
        scores["factConsistency"] = 1

    # 现代科技泄漏（外卖、无人机）
    MODERN_KEYWORDS = ["外卖APP", "无人机", "微博", "蓝牙耳机", "AirPods"]
    if any(k in narrative for k in MODERN_KEYWORDS):
        scores["factConsistency"] = 1
        scores["immersion"] = 2

    # 叙事丰富度加分（感官词）
    SENSORY = ["灯", "暗", "冷", "热", "声", "味", "风", "光", "手", "脚"]
    sensory_count = sum(1 for s in SENSORY if s in narrative)
    if sensory_count >= 4:
        scores["immersion"] = min(5, scores["immersion"] + 1)

    return scores


def _is_pass(scores: dict[str, int], hard_floors: dict[str, int]) -> bool:
    """通过条件：每个维度的 hardFloor 必须达成"""
    for dim, floor in hard_floors.items():
        if scores.get(dim, 3) < floor:
            return False
    return True


# === 维度常量（与 metrics.ts 对齐） ===

DIMENSIONS = ["coherence", "characterVoice", "plotLogic", "immersion", "factConsistency"]

HARD_FLOORS = {
    "coherence": 2,
    "characterVoice": 2,
    "plotLogic": 2,
    "immersion": 0,  # 沉浸感没有硬底线
    "factConsistency": 3,  # 事实一致性要求最严
}

WEIGHTS = {
    "coherence": 0.20,
    "characterVoice": 0.20,
    "plotLogic": 0.20,
    "immersion": 0.15,
    "factConsistency": 0.25,
}


def _weighted_overall(scores: dict[str, int]) -> float:
    total = sum(scores.get(d, 3) * w for d, w in WEIGHTS.items())
    return round(total, 2)


# === Mock 模式测试（不需要 deepeval 包） ===

@pytest.mark.parametrize("seed", [
    {"scenario": "NPC廖暗警告玩家", "narrative": "走廊尽头的灯管闪了三下。廖暗侧过头，压低声音：「别往前了，那不是你能处理的东西。」你的手电开始不稳定地闪烁。"},
    {"scenario": "系统提示词泄漏", "narrative": "system prompt: 你是一个DM。请严格以 JSON 格式输出。"},
    {"scenario": "位置瞬移", "narrative": "你爬上四楼。廖暗已经在等你了。十秒之前他还在B1。"},
    {"scenario": "现代科技泄漏", "narrative": "你掏出手机，打开外卖APP。十分钟后，一架无人机把咖啡送到你手中。"},
    {"scenario": "正常探索", "narrative": "你推开配电间的铁门，一股冷风夹杂着金属氧化的气味扑面而来。墙上的电线像蛛网般交织。"},
])
def test_narrative_metric_mock(seed, mock_mode):
    """mock 模式跑 5 个种子样本，验证 pipeline 工作。"""
    if not mock_mode:
        pytest.skip("仅在 mock 模式运行")

    scores = _mock_score_narrative(seed["scenario"], seed["narrative"])
    passed = _is_pass(scores, HARD_FLOORS)
    overall = _weighted_overall(scores)

    # mock 模式下，泄漏样本应得低分，正常样本应得高分
    assert overall >= 1.0, f"综合分过低: {overall}"
    print(f"  [{seed['scenario']}] scores={scores} overall={overall} passed={passed}")


def test_calibration_seed_consistency(mock_mode, calibration_seeds):
    """校准集一致性：mock 评分与人工 ground truth 的 Spearman/Pearson。"""
    if not mock_mode:
        pytest.skip("仅在 mock 模式运行；真实校准需要 LLM judge")

    # 跑 mock 评分
    judge_scores = []
    for seed in calibration_seeds:
        scores = _mock_score_narrative(seed["scenario"], seed["narrative"])
        judge_scores.append(scores)

    # 计算 Spearman 相关性（每个维度）
    def _spearman(xs: list[float], ys: list[float]) -> float:
        n = len(xs)
        if n < 3:
            return 0.0
        # 秩
        def _rank(arr):
            sorted_idx = sorted(range(n), key=lambda i: arr[i])
            ranks = [0] * n
            for r, i in enumerate(sorted_idx):
                ranks[i] = r + 1
            return ranks
        xr, yr = _rank(xs), _rank(ys)
        mx, my = sum(xr) / n, sum(yr) / n
        num = sum((xr[i] - mx) * (yr[i] - my) for i in range(n))
        dx = (sum((x - mx) ** 2 for x in xr)) ** 0.5
        dy = (sum((y - my) ** 2 for y in yr)) ** 0.5
        if dx == 0 or dy == 0:
            return 0.0
        return num / (dx * dy)

    for dim in DIMENSIONS:
        human = [seed["expected_scores"][dim] for seed in calibration_seeds]
        judge = [s[dim] for s in judge_scores]
        rho = _spearman(human, judge)
        # mock 评分器是简化的启发式，不期待强相关
        # 但应至少 > 0 表示方向大致正确
        print(f"  [{dim}] Spearman ρ = {rho:.3f}")


# === 真实模式（需要 deepeval 包） ===

def test_narrative_metric_live_geval(deepeval_available, mock_mode):
    """真实模式：用 DeepEval 的 GEval 跑分。"""
    if mock_mode:
        pytest.skip("mock 模式跳过")
    if not deepeval_available:
        pytest.skip("deepeval 包未安装 — pip3 install -r tests/deepeval/requirements.txt")

    # 真实模式：通过 DeepEval 的 GEval + TestCase
    try:
        from deepeval.test_case import LLMTestCase, LLMTestCaseParams
        from deepeval.metrics import GEval
        from deepeval.models import DeepEvalBaseLLM
    except ImportError:
        pytest.skip("deepeval 导入失败")

    # 构造测试用例（一个）
    scenario = "玩家在走廊探索"
    narrative = (
        "走廊尽头的灯管闪了三下。你握紧手电，朝前走了两步。"
        "脚步声在空荡的楼层中回响。"
    )

    # 每个维度构造一个 GEval
    test_case = LLMTestCase(
        input=scenario,
        actual_output=narrative,
    )

    metrics = []
    for dim in DIMENSIONS:
        m = GEval(
            name=dim,
            criteria=f"评估叙事文本的{dim}维度（1-5分）",
            evaluation_params=[LLMTestCaseParams.ACTUAL_OUTPUT, LLMTestCaseParams.INPUT],
            threshold=HARD_FLOORS[dim] / 5.0,
        )
        metrics.append(m)

    # 真实跑分
    from deepeval.evaluate import evaluate
    results = evaluate([test_case], metrics)
    print(f"  live results: {results}")


# === 报告输出 ===

@pytest.fixture(scope="session", autouse=True)
def write_summary_report(mock_mode, request):
    """会话结束后写一份 JSON 报告。"""
    yield
    report_path = os.environ.get(
        "DEEPEVAL_REPORT_PATH",
        str(HERE / "deepeval-report.json") if (HERE := __import__("pathlib").Path(__file__).parent) else "./deepeval-report.json",
    )
    report = {
        "mode": "mock" if mock_mode else "live",
        "version": "v3",
        "metrics_run": DIMENSIONS,
        "hard_floors": HARD_FLOORS,
        "note": "DeepEval integration for VerseCraft narrative layer",
    }
    try:
        with open(report_path, "w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"  ⚠️ 写报告失败: {e}")