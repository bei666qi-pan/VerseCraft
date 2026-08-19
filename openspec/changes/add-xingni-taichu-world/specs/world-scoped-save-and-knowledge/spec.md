## ADDED Requirements

### Requirement: 存档按世界隔离
所有新存档 SHALL 显式保存 `worldId`、`mapId`、已解锁地图与判别式世界状态；不同世界的主存档 MUST 使用不同槽位且不得相互覆盖。

#### Scenario: 同时保留两个世界
- **WHEN** 玩家先保存暗月再创建星逆角色
- **THEN** 两个存档均可独立继续且状态不交叉

### Requirement: 旧存档兼容为暗月
缺少世界身份的旧本地或云端存档 MUST 在读取时迁移为暗月，不得根据地点或内容猜成星逆。

#### Scenario: 加载旧 main_slot
- **WHEN** 旧 `main_slot` 缺少 `worldId`
- **THEN** normalize 结果显式标记为暗月与暗月公寓地图

### Requirement: 世界知识检索强制作用域
世界知识的写入、唯一性、检索、事实审计和 fallback MUST 携带 `worldId`，地图级事实还 MUST 携带 `mapId`；跨世界结果不得进入 prompt。

#### Scenario: 星逆检索无命中
- **WHEN** 星逆查询在数据库中没有结果
- **THEN** 系统只允许回退星逆内容包，不返回暗月事实
