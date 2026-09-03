# PLAYER_CHAT 窄 Writer 协议

在线普通回合只有一次 Writer 模型调用。模型必须调用 `submit_narrative`，参数只有：

- `narrative`
- 四条 `options`
- 固定为 `decision_required` 的 `turn_mode`
- 固定为 `true` 的 `decision_required`

模型不能输出生命、理智、物品、任务、位置、NPC、关系、世界变化或提交状态。服务端把窄候选投影成安全默认值，Mechanics Workflow 通过独立收据提供经注册规则验证的状态增量，最终只有 Turn Finalizer 可以提交并产生 FINAL。

流式 `tool_calls[].function.arguments` 仅在传输层投影为现有增量 JSON 输入。网关不再保留完整 DM JSON terminal、开关或 JSON-mode 兼容性二次调用；工具不兼容会进入确定性失败收口，不会再消耗一次生成调用。

性能门禁分别记录协议首字和首个具体叙事字符。首字 p95 不超过 5 秒，具体叙事每回合硬上限 8 秒，普通回合 final p95 不超过 20 秒。
