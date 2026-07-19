## 1. Bounded final-turn degrade

- [x] 1.1 增加 narrative/state-conflict rollout flag，并在 final consistency resolver 消费它。
- [x] 1.2 将无奖励的“捡起/拾起”等强获得措辞改写为非所有权观察；改写失败时使用保守玩家可见 fallback。
- [x] 1.3 当 hard safety block 剥离冲突战斗 delta 时，替换未提交战果的玩家可见叙事。

## 2. Evidence and verification

- [x] 2.1 添加支持奖励、无奖励、开关关闭和“捡起”真实回归测试。
- [x] 2.2 运行相关单元/contract、lint、OpenSpec strict、diff check，并用真实 `/api/chat` 轨迹验证最终 envelope。
