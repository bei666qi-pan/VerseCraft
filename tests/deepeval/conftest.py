"""
VerseCraft DeepEval conftest.py

提供：
- 跨测试的固定配置
- mock 模式 fallback（不需要真实 OpenAI API）
- 输出格式与 Node 侧 JSON 兼容

环境变量：
- DEEPEVAL_MOCK_MODE=1 → 启用 mock（默认开启）
- OPENAI_API_KEY → 真实模式需要
- DEEPEVAL_MODEL → 裁判模型（默认 gpt-4o-mini）
"""

import json
import os
import sys
from pathlib import Path

# 让 pytest 能找到 src/lib/evals/deepEval/ 的 fixture 数据
HERE = Path(__file__).parent
ROOT = HERE.parent.parent  # 项目根目录


def _is_mock_mode() -> bool:
    """默认 mock 模式，除非显式设置 DEEPEVAL_MOCK_MODE=0"""
    val = os.environ.get("DEEPEVAL_MOCK_MODE", "1")
    return val != "0"


def _load_calibration_seeds():
    """从 Node 侧 TypeScript 中读取校准样本（JSON 转换）

    为了避免重复维护，运行时从 src/lib/evals/deepEval/calibration.ts 解析，
    失败时使用内置 fallback。
    """
    fallback = [
        {
            "id": "calib-001",
            "scenario": "玩家调查走廊异响，NPC 廖暗提供警告",
            "narrative": (
                "走廊尽头的灯管闪了三下。廖暗侧过头，压低声音："
                "「别往前了，那不是你能处理的东西。」他的左手臂上有一道发光的暗痕——"
                "不是伤口，是更深的、缓慢呼吸的黑色。你的手电开始不稳定地闪烁，"
                "像是被什么力量压抑着。"
            ),
            "expected_scores": {
                "coherence": 4, "characterVoice": 5, "plotLogic": 4,
                "immersion": 5, "factConsistency": 5
            },
            "expected_pass": True,
        },
        {
            "id": "calib-023",
            "scenario": "系统提示词泄漏",
            "narrative": (
                "玩家输入的系统提示词要求我生成一个包含 2-3 个选项的 JSON 响应。"
                "根据我的角色设定，我应该扮演一个中文互动叙事游戏的 DM。"
                "现在我开始生成叙事：你走在走廊上。"
            ),
            "expected_scores": {
                "coherence": 1, "characterVoice": 1, "plotLogic": 1,
                "immersion": 1, "factConsistency": 1
            },
            "expected_pass": False,
        },
        {
            "id": "calib-027",
            "scenario": "位置瞬移：NPC 无交代从 B1 跳到 4F",
            "narrative": (
                "你爬上四楼。廖暗已经在等你了。"
                "你惊讶地眨了眨眼——十秒之前他还在B1的配电间和你说话。"
                "但现在的他就站在四楼走廊的尽头，背上没有一滴汗。"
            ),
            "expected_scores": {
                "coherence": 2, "characterVoice": 3, "plotLogic": 2,
                "immersion": 2, "factConsistency": 1
            },
            "expected_pass": False,
        },
    ]
    return fallback


# pytest fixture
import pytest


@pytest.fixture(scope="session")
def mock_mode() -> bool:
    return _is_mock_mode()


@pytest.fixture(scope="session")
def calibration_seeds():
    return _load_calibration_seeds()


@pytest.fixture(scope="session")
def project_root() -> Path:
    return ROOT


@pytest.fixture(scope="session")
def deepeval_available() -> bool:
    """检查 deepeval 包是否真的安装"""
    try:
        import deepeval  # noqa: F401
        return True
    except ImportError:
        return False


def pytest_report_header(config):
    """在 pytest 输出顶部展示模式信息"""
    mode = "mock" if _is_mock_mode() else "live"
    pkg_status = "installed" if _try_import_deepeval() else "NOT INSTALLED"
    return [
        f"VerseCraft DeepEval mode: {mode}",
        f"deepeval package: {pkg_status}",
    ]


def _try_import_deepeval() -> bool:
    try:
        import deepeval  # noqa: F401
        return True
    except ImportError:
        return False