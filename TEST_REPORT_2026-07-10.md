# VerseCraft Stage A 真实运行测试报告

**日期**: 2026-07-10  
**配置**:  
- SUT DM: ac-deepseek-v4-flash (via one-api `ai.yxkl.cloud`)  
- Player Agent: ac-deepseek-v4-flash (via same one-api)  
- 每局步数: 100 步  
- softlock 阈值: 40  
- 步间延迟: 2s  
- 无叙事裁判（`runNarrativeJudge: false`）

## 三系统概述

| 系统 | 场景 | Persona | 预期目标 |
|---|---|---|---|
| 武器系统 | weapon-lifecycle, weapon-combat | speedrunner, explorer, collector | 武器获取→使用→损耗→修复全流程 |
| 职业/转职 | profession-progression, profession-combat-synergy | speedrunner, explorer | 无职业→守灯人→猎影者 |
| 战斗系统 | combat-survival, combat-weapon-degradation | speedrunner, explorer | 战斗生存链与武器降级 |

---

## 1. 武器系统

**状态**: 运行中...

### Trace 文件

暂无。

### 关键发现

（待数据）

---

## 2. 职业/转职系统

**状态**: 等待串行执行...

---

## 3. 战斗系统

**状态**: 等待串行执行...

---

## 总体发现

（待所有系统完成后汇总）

---

## 附录

### 环境配置

- AI 网关: `https://ai.yxkl.cloud/v1` (one-api)
- DM 模型: `ac-deepseek-v4-flash`（原 `deepseek-v4-flash` 在按次套餐分组无可用通道）
- 冷启动: one-api 首次调用约需 3-6s（非预期的 1-3min）
- `.env.local`: `AI_GATEWAY_API_KEY` 与 `DEEPSEEK_API_KEY` 共用同一 key
