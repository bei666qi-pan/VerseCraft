# dark-moon-only-world Specification

## Purpose

规定“序章·暗月”作为多世界架构中的独立可选世界时，其产品入口、运行时隔离、在线回合兼容契约与仓库内容要求。

## Requirements

### Requirement: 暗月是独立可用世界
系统 SHALL 将“序章·暗月”作为独立可选择、创建、继续和运行的世界，并与其他世界的内容和状态严格隔离。

#### Scenario: 新玩家选择暗月
- **WHEN** 玩家从首页进入开场和角色创建流程
- **THEN** 系统只呈现暗月内容并创建暗月角色状态

#### Scenario: 玩家进入暗月游玩页
- **WHEN** 玩家加载暗月存档打开 `/play`
- **THEN** 系统渲染暗月阅读壳层、角色数据和暗月回合交互

### Requirement: 暗月运行时不包含其他世界逻辑
系统 MUST 不加载、调用或持久化只服务星逆·太初或其他世界的 prompt、validator、状态 delta、境界、灵根、灵石、地图或 NPC 事实。

#### Scenario: 提交暗月行动
- **WHEN** 玩家通过 `/api/chat` 提交暗月行动
- **THEN** 服务端仅执行暗月适配器和共享回合工作流

#### Scenario: 保存暗月进度
- **WHEN** 客户端持久化暗月状态或快照
- **THEN** 产物不包含星逆专属世界状态

### Requirement: 暗月在线回合契约保持兼容
系统 MUST 保持暗月 `/api/chat` 的 SSE、最终 DM JSON 收口、`keys_missing` 降级、状态提交、认知过滤、生成后校验和后台 world tick 契约。

#### Scenario: 网关可用
- **WHEN** 暗月行动获得正常模型响应
- **THEN** 系统继续以 status/data 帧流式返回，并以 `__VERSECRAFT_FINAL__` 提供权威结果

#### Scenario: 网关密钥缺失
- **WHEN** AI gateway 未配置
- **THEN** 系统继续返回 `200 + text/event-stream`、`keys_missing` 状态和可解析 final

### Requirement: 世界专属资产不交叉加载
仓库中的暗月运行时内容 MUST 通过暗月适配器消费，星逆运行时不得将其作为 seed、fallback 或展示常量。

#### Scenario: 执行跨世界残留扫描
- **WHEN** 维护者扫描星逆 prompt、内容包与状态输出
- **THEN** 不存在暗月 NPC、地点、货币、异常或结局事实

### Requirement: 目标内容资产被清除
仓库 MUST 不再包含只服务已移除恋爱世界的功能代码、测试代码、benchmark、视觉组件、内容文档或待实施规划。

#### Scenario: 执行仓库残留扫描
- **WHEN** 维护者扫描目标世界名称、模块路径和专属符号
- **THEN** 除本次删除记录与暗月 canon 的防误写边界外，不存在产品或测试残留
