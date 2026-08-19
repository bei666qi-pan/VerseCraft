## ADDED Requirements

### Requirement: 世界与地图身份显式分流
系统 MUST 使用受支持的 `worldId` 与属于该世界的 `mapId` 选择入口、创建配置、在线回合运行时和确定性规则，不得从 narrative 或地点文字猜测世界。

#### Scenario: 提交星逆回合
- **WHEN** 玩家从星逆·太初存档在青石县提交行动
- **THEN** 系统仅组装星逆 prompt、青石县地图/NPC 事实和玄幻规则

#### Scenario: 提交不匹配地图
- **WHEN** 请求携带不属于当前世界的地图标识
- **THEN** 系统通过兼容 SSE final 明确拒绝且不回退到暗月

### Requirement: 新世界可灰度关闭
系统 SHALL 通过服务端配置控制星逆·太初的可进入状态，关闭时 MUST 保留已有存档并阻止新建或继续该世界。

#### Scenario: 灰度关闭后查看存档
- **WHEN** 玩家拥有星逆存档但世界开关关闭
- **THEN** UI 显示暂不可进入且不得将该存档加载为暗月

### Requirement: 在线回合兼容既有 SSE 契约
多世界分流 MUST 保持 `200 + text/event-stream`、status 帧、`__VERSECRAFT_FINAL__` 权威终帧、`keys_missing` 降级和 DM 最低必填字段。

#### Scenario: 星逆网关未配置
- **WHEN** 星逆行动遇到缺少 gateway key
- **THEN** 系统快速返回 `keys_missing` status 与可解析的星逆作用域 final
