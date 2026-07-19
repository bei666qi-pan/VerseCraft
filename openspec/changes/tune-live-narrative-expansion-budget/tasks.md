## 1. 有界扩写预算

- [x] 1.1 将默认后置叙事扩写预算调至真实 gateway 可完成的范围，保持现有环境覆盖与总回合夹紧。
- [x] 1.2 为默认预算和总回合边界添加确定性回归测试。
- [x] 1.3 根据真实多回合超时证据把默认上限从 6 秒经 8 秒复测调整至 10 秒，并更新 route clamp 与预算契约。
- [x] 1.4 将单回合扩写从过紧的 p50 剩余时间改为 p95 剩余时间夹紧；保留 live benchmark 的聚合 p50/p95 门禁。
- [x] 1.5 Align the logical-task expansion clamp with the 10-second route budget; no caller may silently be reduced to 8 seconds.

## 2. 真实验证

- [x] 2.1 运行相关单元测试、OpenSpec strict validation、lint 与 diff check。
- [x] 2.2 使用配置好的真实 gateway 跑短叙事 `/api/chat` probe，记录 SSE、长度与 final 时延结果。
- [x] 2.3 在最终 10 秒扩写预算下重跑无 mock 多回合 live benchmark，检查长度、SSE 与 final p95。
