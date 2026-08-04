## Why

仓库当前混入了尚未完成的“知夏之梦”恋爱世界实现、测试、素材与规划文档，导致产品入口、运行时状态和在线回合链路不再只服务当前主世界“序章·暗月”。需要彻底移除这套题材分支，并恢复暗月作为唯一可选、可创建、可游玩的世界。

## What Changes

- **BREAKING**：删除“知夏之梦”世界、恋爱世界选择、恋爱角色创建、梦境关系/心痕/锚点/结局等功能及其状态字段。
- 删除对应的服务端 prompt packet、导演逻辑、validator、内容 registry、UI 组件、测试、benchmark、设计文档和旧 OpenSpec change。
- 清理 `/api/chat`、`useGameStore`、角色创建、开场页、`/play` 壳层、快照与 DM JSON 规范化中的恋爱分支接线，保留暗月原有行为。
- 保留暗月世界中为防止角色误写而存在的“非恋爱”边界描述；它们属于暗月 canon，不是恋爱玩法。
- 不采用仓库级 Git 回退，因为工作树含有大量与本改动无关的未提交修改；只定向移除可确认的目标内容。

## Capabilities

### New Capabilities

- `dark-moon-only-world`: VerseCraft 仅暴露、创建并运行“序章·暗月”世界，且不携带已移除恋爱世界的运行时与持久化状态。

### Modified Capabilities

无。

## Impact

- 影响角色创建、开场页、`/play` UI、唯一游戏 store、存档快照、在线聊天路由与 prompt 组装、DM JSON schema/normalize、世界 registry、内容与测试资产。
- `/api/chat` 仍保持 `200 + text/event-stream`、status frame、`__VERSECRAFT_FINAL__` 和 `keys_missing` 降级契约；本变更只删除额外分支，不增加首包前工作，预期 TTFT 不恶化。
- 不修改数据库 schema、analytics 事件名或后台 world tick 协议；无需迁移或回填服务端数据。
- 旧客户端本地存档中的已移除字段将由现有宽松反序列化忽略；暗月存档继续兼容。
