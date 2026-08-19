# world-scoped-save-and-knowledge Specification

## Purpose

规定本地与云端存档如何显式携带世界身份并使用独立槽位，旧存档如何兼容迁移为暗月，以及世界知识写入、唯一性、检索、审计和 fallback 如何强制作用域隔离。

## Requirements

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

### Requirement: 星逆生产状态兼容迁移且不污染暗月
系统 MUST 将旧星逆最小状态迁移为生产状态并保留等价进度，同时保持暗月 save slot、快照语义和世界状态不变。

#### Scenario: 双世界存档升级
- **WHEN** 同一用户同时拥有旧暗月槽和旧星逆槽
- **THEN** 仅星逆槽新增生产字段且两个槽仍可独立继续

### Requirement: 生产内容知识幂等且有世界作用域
青石县 NPC 日程、任务公开事实、地点、敌人和服务内容 MUST 以 `xingni_taichu + xingni_qingshi_county` 作用域幂等 seed；检索无命中时不得回退暗月。

#### Scenario: 重复执行生产 seed
- **WHEN** 对同一数据库重复执行青石县 seed
- **THEN** 实体和 chunk 不重复且所有 chunk 保持正确世界和地图作用域
