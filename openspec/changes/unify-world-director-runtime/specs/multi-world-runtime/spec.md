## MODIFIED Requirements

### Requirement: 世界与地图身份显式分流
系统 MUST 使用受支持的 `worldId` 与属于该世界的 `mapId` 选择入口、创建配置、在线回合运行时、确定性规则、后台 Director job/run/persistence、Actor context 与 Writer hint，不得从 narrative、地点文字或客户端摘要猜测世界。所有后台查询和唯一性约束 MUST 使用显式 `worldId + mapId + sessionId` 复合作用域。

#### Scenario: 提交星逆回合
- **WHEN** 玩家从星逆·太初存档在青石县提交行动
- **THEN** 系统仅组装星逆 prompt、青石县地图/NPC 事实和玄幻规则，并仅入队及读取星逆青石县作用域的 Director 数据

#### Scenario: 提交不匹配地图
- **WHEN** 请求携带不属于当前世界的地图标识
- **THEN** 系统通过兼容 SSE final 明确拒绝且不回退到暗月

#### Scenario: 两世界共用 session 标识
- **WHEN** 暗月与星逆数据具有相同 `sessionId`
- **THEN** job、run、agenda、state、NPC projection 与 hint 查询仍互相隔离
