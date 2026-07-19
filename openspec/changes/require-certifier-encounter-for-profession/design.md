## Context

职业认证在 `/play` 回合完成后由客户端展示认证选项，再调用 store 的不可逆单职业 action。资格、试炼完成和职业状态本身已经由结构化逻辑裁决；唯独“已遇到签发者”会把动态 NPC 位于任意一楼位置误当作 encounter，缺少玩家本回合的结构化相遇事实。

## Goals / Non-Goals

**Goals:**

- 认证选择只在签发者被本回合结构化 DM 更新明确呈现时首次解锁。
- 已确认相遇后的持久标志继续允许玩家在同一局稍后完成认证。
- 让门禁在不读取 narrative、不增加模型调用的情况下可独立测试。

**Non-Goals:**

- 不重做职业资格、试炼或认证 UI。
- 不把位置相同视为强制可见性；需要相遇的 DM 必须明确返回结构化 NPC 证据。

## Decisions

### 1. 用本回合结构化 NPC id 作为首次 encounter 证据

从 `codex_updates`、`relationship_updates` 和 `npc_location_updates` 收集本回合出现的 NPC id，并与职业 registry 中签发者集合求交。只在玩家位于一楼且有交集时写入 `hasMetProfessionCertifier`。

拒绝以 `dynamicNpcStates` 的当前位置做证据：位置只表示世界状态，不能证明玩家相遇。拒绝解析 narrative：它是非权威文本，可能幻觉或不完整。

### 2. 保留相遇后的持久门禁

`hasMetProfessionCertifier` 仍是已确认相遇的 client-first 存档状态，必须进入 Zustand 持久化切片；首次确认后，认证选择仍需同时满足既有资格与一楼条件。这样玩家不会因离开、重载或 NPC 移动而失去已获得的认证机会。旧持久化 blob 缺少该字段时按 `false` 处理，绝不通过迁移臆造 encounter。

### 3. 不可逆 store 提交再次校验

页面中的选择可见性不是安全边界。`certifyProfession` store action 和 profession reducer MUST 要求明确的 `hasMetProfessionCertifier` 证明；只有页面在已确认相遇后才传入该证明。这样陈旧 UI、未来调用者或测试工具不能仅凭资格计算直接写入单职业状态。

## Risks / Trade-offs

- [模型未写出结构化 NPC 更新] → 不显示认证而非错误授予；玩家可以继续行动，且现有 post-generation/DM delta 链路负责生成结构化更新。
- [旧存档已有已相遇标志] → 保留该标志，不迁移或撤销已有玩家身份。
- [认证 UI 不易端到端驱动] → 纯函数验证首遇证据，store 集成验证资格和单职业不变量；live campaign 继续只计 DM 已提交任务证据。

## Migration Plan

1. 提取 encounter 纯函数并替换页面中的动态位置分支。
2. 运行职业、页面静态约束、写入后重载的 store 回归和浏览器认证闭环测试。
3. 回滚只需恢复旧门禁；无 API、数据库或存档迁移。
