## ADDED Requirements

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
