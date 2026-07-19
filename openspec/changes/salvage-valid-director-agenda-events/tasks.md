## 1. Director validator 收口

- [x] 1.1 区分 plan-level 与 item-level hard failures，保留合规 agenda/social event 的 accepted codes。
- [x] 1.2 确保 worker 只写 accepted code，同时完整保留 rejection telemetry。

## 2. 验证

- [x] 2.1 为混合 agenda、计划级风险和 private hook 提供单元回归。
- [x] 2.2 运行 world-engine 测试、lint、OpenSpec strict、diff check 和真实 PostgreSQL worker/director probe。
