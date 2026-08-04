# dark-moon-only-world Specification

## Purpose

规定 VerseCraft 仅提供“序章·暗月”世界时的产品入口、运行时边界、在线回合兼容契约与仓库内容要求。

## Requirements

### Requirement: 暗月是唯一可用世界
系统 SHALL 只向玩家展示、创建、继续和运行“序章·暗月”世界，不得暴露已移除的恋爱世界选择或入口。

#### Scenario: 新玩家开始游戏
- **WHEN** 玩家从首页进入开场和角色创建流程
- **THEN** 系统只呈现暗月内容并创建暗月角色状态

#### Scenario: 玩家进入游玩页
- **WHEN** 玩家打开 `/play`
- **THEN** 系统只渲染暗月阅读壳层、角色数据和回合交互

### Requirement: 运行时不包含已移除世界逻辑
系统 MUST 不加载、调用或持久化只服务已移除恋爱世界的 prompt、导演、validator、状态 delta、关系机制、梦境机制或结局机制。

#### Scenario: 提交暗月行动
- **WHEN** 玩家通过 `/api/chat` 提交暗月行动
- **THEN** 服务端仅执行暗月通用回合工作流，且不组装已移除世界的运行时 packet

#### Scenario: 保存暗月进度
- **WHEN** 客户端持久化当前游戏状态或存档快照
- **THEN** 产物不包含只服务已移除世界的状态字段

### Requirement: 暗月在线回合契约保持兼容
系统 MUST 保持 `/api/chat` 的 SSE、最终 DM JSON 收口、`keys_missing` 降级、状态提交、认知过滤、生成后校验和后台 world tick 契约。

#### Scenario: 网关可用
- **WHEN** 暗月行动获得正常模型响应
- **THEN** 系统继续以 status/data 帧流式返回，并以 `__VERSECRAFT_FINAL__` 提供权威结果

#### Scenario: 网关密钥缺失
- **WHEN** AI gateway 未配置
- **THEN** 系统继续返回 `200 + text/event-stream`、`keys_missing` 状态和可解析 final

### Requirement: 目标内容资产被清除
仓库 MUST 不再包含只服务已移除恋爱世界的功能代码、测试代码、benchmark、视觉组件、内容文档或待实施规划。

#### Scenario: 执行仓库残留扫描
- **WHEN** 维护者扫描目标世界名称、模块路径和专属符号
- **THEN** 除本次删除记录与暗月 canon 的防误写边界外，不存在产品或测试残留
