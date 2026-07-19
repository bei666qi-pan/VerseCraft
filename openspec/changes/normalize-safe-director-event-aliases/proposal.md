## Why

真实 Director run 83 表明模型已提出两条低风险、可拒绝的环境事件，但使用 `ambient_event` / `clue_update` 这两个未识别 payload 别名并给出空保护数组，致使 validator 拒绝整个 agenda，后台导演无法实际发挥作用。

## What Changes

- 将 `ambient_event`、`clue_update`、`environmental_clue` 与 `environmental_event` 四个已在真实模型输出中出现的低风险 payload 别名规范化为既有安全环境类别。
- 只为满足现有低风险观察条件的事件补固定 agency/forbidden defaults；高优先级、强制或危险措辞继续拒绝。
- 增加真实形状回归与真实 PostgreSQL → worker → reasoner → agenda → consumer 复验。

## Capabilities

### New Capabilities

- `safe-director-event-alias-normalization`: 真实模型常用的安全环境事件别名可进入既有确定性安全护栏与 agenda。

### Modified Capabilities

- 无。

## Impact

- 仅影响后台 world-engine parser/validator 与 agenda；不改变 `/api/chat` SSE、在线 TTFT、数据库 schema 或 analytics 事件名。
- 无新模型调用、首字路径 IO 或灰度开关；未知/危险 payload 仍安全失败并保留验证拒绝。
