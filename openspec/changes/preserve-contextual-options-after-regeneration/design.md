## Context

`evaluateOptionsSemanticQuality` 现以 narrative 字面词和原始 `playerLocation` 建锚。实际 live recovery 回合的已知位置是内部键 `B1_PowerRoom`，叙事只说明修复完成；模型输出“检查电源室”“询问老刘”“握紧武器警戒”虽与客户端状态一致，却缺少字面重合，因此被全部拒绝。浏览器随后只能显示手输入口，不能稳定提供可点击行动。

## Goals / Non-Goals

**Goals:**

- 将客户端已知且玩家可见的场景实体转换成少量补充锚点，减少 options-only 的假阴性。
- 不降低对空泛、重复、远离当前场景和高同质选项的过滤。
- 保持质量门为纯函数，不读取环境、网络或状态仓库。

**Non-Goals:**

- 不让模型选项改写游戏状态或绕开服务端 final/commit。
- 不放宽为“任一包含位置/NPC/武器词的选项都接受”，也不改变 `/api/chat`、SSE、prompt、AI 路由或延迟预算。
- 不修改现有玩家可见 UI 文案。

## Decisions

### 1. 扩展质量门输入，而不是从内部 ID 猜测世界知识

`OptionSemanticGuardInput` 新增可选 `sceneAnchors`。调用方从当前页面已经持有的显示名称（位置、在场 NPC、武器、库存提示）构造并限长传入；纯函数只规范化和合并这些文本。这样不会在 guard 内引入 registry/DB/lore IO，也不会把内部 `B1_PowerRoom` 错当玩家可见中文地点。

### 2. 结构化锚点只补充 narrative 锚点

保持现有叙事锚点、去重、泛化、目标复用和同质化规则。场景锚点仅参与 `isAnchoredToNarrative` 的可行动相关性判定；若选项只包含泛泛动词或无关地点，仍会失败。

### 3. 用真实误伤样本锁定边界

单测使用真实 recovery 类情境：叙事没有“电源室/老刘”字面词，但 scene anchors 已声明它们与武器，四条具体行动须可通过。相邻反例仍验证“去北门打篮球”等无关行动不会因任何 scene anchor 被接受。live campaign 的 options evidence 继续证明是否实际获得且应用模型行动，而不由单测替代。

### 4. 将“可继续游玩”与“四条补齐目标”分开

`decision_required` 的 turn envelope 已允许两至四条选择。options-only 继续至多执行一次 repair pass，目标为四条；若最终有两或三条真实模型行动通过同一去重和语义门，页面直接写入并展示。零或一条仍被视为失败。该策略不新增本地模板、不补写模型动作，也不把 partial 标为 full completion；评测 trace 会显式记录 `complete: false`。叙事锚点支持有限同义集合（阴影 / 黑影 / 漆黑），并为历史存档的 `item_phone` / `item_bandage` 保留可见显示别名，避免内部 ID 缺失名称导致真实可见行动被误伤。

## Risks / Trade-offs

- [调用方传入未经显示层过滤的内部事实] → 只接受已渲染/可见的文本锚点；本 change 不在 guard 内解码 ID，并为输入限长。
- [锚点太宽导致无关选项漏过] → 保留泛化、重复、同质化与文本匹配门；用反例测试锁定。
- [不同语言显示名不一致] → 只作文本补充，原 narrative 锚点仍存在；空数组时完全保留当前行为。

## Migration Plan

1. 先扩展纯函数输入与单测，空 `sceneAnchors` 保持结果不变。
2. 页面调用方传入当前可见位置/NPC/武器/道具锚点。
3. 跑 options-only live evidence；如出现回归，可关闭既有 semantic-gate 灰度开关回退到当前拒绝策略。
