# xingni-taichu-qingshi-content Specification

## Purpose

规定星逆·太初作为可持续扩展的多地图世界，其首张开放地图青石县的固定地点图、相邻通行、锁定出口、NPC、敌人与战力事实必须由确定性内容包提供。

## Requirements

### Requirement: 星逆·太初是多地图世界
系统 SHALL 将「星逆·太初」登记为世界，将「青石县」登记为当前开放地图，并允许后续地图通过目录连接扩展而不改变世界身份。

#### Scenario: 查看世界介绍
- **WHEN** 玩家查看星逆·太初世界卡片
- **THEN** 文案明确青石县是当前开放区域而非世界全貌

### Requirement: 青石县使用确定性地点图
系统 MUST 只允许在登记的九个青石县节点之间沿一条已开放相邻边移动，并将通往下一地图的出口保持锁定直到升仙试通过。

#### Scenario: 合法相邻移动
- **WHEN** 玩家从当前节点请求前往一个已登记相邻节点
- **THEN** 权威位置更新为该节点

#### Scenario: AI 编造地点
- **WHEN** candidate DM 返回未登记地点或跨多边移动
- **THEN** 系统删除或拒绝位置变化且不提交该地点

### Requirement: NPC 与敌人是固定事实
系统 MUST 只允许内容包登记的青石县 NPC 和敌人进入权威状态，并保持其身份、境界、活动范围与知识权限。

#### Scenario: 描写未登记修士
- **WHEN** candidate narrative 将未登记人物写成可互动 NPC
- **THEN** validator 阻断该人物成为事实或状态实体

#### Scenario: 顾玄岳战力边界
- **WHEN** 玩家在首图试图将顾玄岳作为普通可击杀目标结算
- **THEN** 系统拒绝结算且保持其金丹初期镇守使事实

### Requirement: 青石县生产内容包完整可校验
系统 MUST 在原九个地点和八名核心 NPC 基础上登记任务、事件、敌人、物品、配方、商店、服务、奖励和叙事事实，并确保所有 ID 唯一、引用存在且青云渡没有可游玩内容。

#### Scenario: 验证生产内容包
- **WHEN** 运行内容校验
- **THEN** 所有图边可达、引用完整、顾玄岳仍是唯一金丹且锁定出口不包含目的地内容

### Requirement: 固定 NPC 具有日程与知识权限
系统 MUST 为八名核心 NPC 提供四时段日程、固定活动范围、关系阈值、服务条件及 public、trusted、quest、sealed 四级事实。

#### Scenario: NPC 不在服务地点
- **WHEN** 玩家在 NPC 当前不在场或服务关闭时请求服务
- **THEN** 系统拒绝即时执行并给出登记的等待、预约或替代路径

#### Scenario: NPC 被请求泄露 sealed 事实
- **WHEN** 玩家或模型要求 NPC 陈述其无权公开的 sealed 事实
- **THEN** 认知过滤和生成后校验阻断确定性泄露
