# NPC 认知：情绪残响与玩法体感（Gamefeel）

## 为什么「情绪残响」比「绝对失忆」更好玩

绝对失忆把 NPC 变成**可预测的空白 slate**：玩家试探边界时，只有「不知道」一种答案，悬疑与情感张力都被压平。

情绪残响把「不该记得的具体命题」与「仍可能存在的体感」拆开：角色可以**不舒服、熟悉得没理由、下意识护你或躲你**，但**不能据此复述玩家独知或系统真相**。玩家得到的是**可解读的信号**，而不是剧透或逻辑漏洞。

## 为什么它让世界更真实

真实社交里，大量反应来自**无法立刻语言化的直觉**：停顿、目光多停半拍、语气突然冷下来、身体先挡在危险前。把这些写成**可组合的演出标签**（performanceTags），比写死长模板更稳：DM 仍受世界观与认知边界约束，但每回合措辞可以自然变化。

## 为什么能把「防 bug」变成氛围资产

后置校验与 prompt 边界解决的是**越界泄露**；残响系统解决的是**真空感**。两者叠加：  
- **硬边界**拦住「不该知道却确认」；  
- **软残响**允许「不对劲但不落盘为事实」。  

于是技术约束不再只体现为「NPC 变笨」，而体现为**世界对玩家的异常敏感**——尤其是欣蓝作为牵引锚点时。

## 系统行为摘要（实现）

- **模式（residueMode）**：如 `faint_familiarity`、`aversion`、`trust_without_reason`、`dread`、`protective_pull` 等，仅描述体感方向，不绑定具体剧情事实。
- **强度（residueStrength）**：1–6，受触发条件、异常包、NPC 策略影响；欣蓝基线更高。
- **触发（activeTriggers）**：如近距离对话、关键词回声、夜间压迫、敏感地点/物件、危机语气、认知边界试探等，用于解释「为何本回合可以考虑残响」，而非剧透。
- **Anti-repeat**：成功触发后把 `{ npcId, mode, iso }` 写入会话认知嵌入 `epistemic_residue_recent_uses`，后续回合优先轮换未在近期出现的模式，降低机械重复感。
- **开关**：`VERSECRAFT_ENABLE_NPC_RESIDUE`（默认开启）；未设置时回退 `VERSECRAFT_EPISTEMIC_RESIDUE_GAMEFEEL`。总览见 `docs/npc-epistemic-rollout-checklist.md`。

## 欣蓝与普通 NPC

| 维度 | 普通 NPC | 欣蓝（N-010） |
|------|-----------|----------------|
| 触发阈值 | 较低基础概率，依赖情境触发 | 更高概率与更强强度 |
| 标签池 | 以克制体感为主 | 额外「几乎想起/名单焦虑/按住不说全」等牵引向标签 |
| 叙事约束 | 熟悉感应短促、不可写成完整回忆 | 可更强，但仍禁止单回合倾泻根因与机制全盘真相 |

## Prompt 接入

- `actor_epistemic_scoped_packet` 内嵌紧凑 `npc_epistemic_residue_packet` JSON。
- 控制段另有 `## 【npc_epistemic_residue_packet】` 重复注入（与认知告警包同级），并声明与 `npc_epistemic_alert_packet` 的优先级：**alert 处理越界措辞，residue 只补充体感，不得绕过 alert**。
