## 1. 评测证据模型与严谨收口

- [x] 1.1 新增模型叙事评审的 typed target、verdict、provenance、inconclusive reason 与汇总 gate 纯函数。
- [x] 1.2 实现 scope-bound target 装配、结构化 prompt、严格 verdict parser 与 evidence validation，复用 `EVAL_JUDGE` logical task、预算与 hash cache。
- [x] 1.3 为 live gateway 失败、预算耗尽、无效 JSON、低置信、无证据 critical/major、健康输出和支持性幻觉输出补充单元测试。

## 2. 可玩性评审运行器

- [x] 2.1 新增显式 live CLI runner，收集权威 SSE final 与多回合轨迹后执行模型评审，并支持 smoke/standard profile、feature flag、timeout、缓存和严格 coverage assertion。
- [x] 2.2 输出脱敏 JSON/Markdown 报告，展示 rubric/task/model、case/content hash、provenance、coverage、inconclusive reason、issue evidence 与严格 gate 结论。
- [x] 2.3 让现有 live playthrough 使用新证据分类，确保 live 失败不会以 offline verdict 伪装为通过。

## 3. 质量基线与文档

- [x] 3.1 增加高价值幻觉与可玩性 fixtures：事实凭空生成、低 reveal 泄露、状态/叙事冲突、不可执行选项、玩家能动性缺失及正常对照。
- [x] 3.2 更新评测入口文档、package scripts 和 nightly/dispatch 配置，将 mock/确定性结果明确标为回归覆盖，并为 opt-in live review 保存报告 artifact。

## 4. 验证

- [x] 4.1 运行新增/相关的评测单元测试、`pnpm test:judge`、`pnpm test:playthrough` 与 `npx eslint .`。
- [x] 4.2 在 gateway 可用且用户允许成本时运行最小 live smoke，记录真实模型/评审证据；不可用时明确报告未运行原因，绝不以 mock 替代。

## 5. Judge JSON gateway 兼容性补强

- [x] 5.1 让 EVAL_JUDGE 使用不改变其离线预算/role fallback 的 strict JSON transport（关闭可选 thinking、保守 wrapper 提取）。
- [x] 5.2 增加路由契约测试，并用 fresh live trace 运行真实模型评审验证 provenance 不再因包装格式退化。
- [x] 5.3 将权威初始状态写入 playthrough trace，并验证真实模型评审以该状态审阅首回合的机制变化。
- [x] 5.4 在 live trace 记录实际 `options_regen_only` 的客户端等价结果；模型评审仅在客户端真实写入的两至四条选项时使用再生选项，并保留四条补齐的完整性标识，以测试与 fresh live review 验证。
