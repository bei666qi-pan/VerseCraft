# baselines/

阶段级评测基线快照，**入库保存**（`.runtime-data/` 下的原始 JSON 报告不入库，靠 CI artifact 与本目录抄录留痕）。

命名规范：`<日期>-<阶段>-<说明>.md`，例如 `2026-07-09-phase-0-initial.md`。

每份基线至少包含：

1. 执行的命令与环境（mock / live、commit hash）。
2. 各评测的 gate 结果与关键维度分数。
3. styleValidator 遥测聚合（averageSentenceLength、sentenceLengthSpread、sensoryWordCount、uniqueWordRatio、forbiddenPhraseHits、对白占比等）。
4. 与上一份基线的对比结论（升/降/持平，超过 ±5% 的变化必须给出解释）。
