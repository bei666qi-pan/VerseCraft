## 1. 世界与内容基座

- [x] 1.1 实现世界/地图类型、目录、灰度可用性与运行时解析并覆盖单元测试
- [x] 1.2 实现青石县九节点确定性地图、固定 NPC/敌人/服务内容包与内容校验测试
- [x] 1.3 实现玄幻状态、修炼/炼丹/炼器/凭证/升仙试纯裁决器并覆盖成功与失败测试

## 2. 状态与持久化

- [x] 2.1 扩展唯一 Zustand store 与 RunSnapshotV2，保存世界、地图、解锁地图和判别式世界状态
- [x] 2.2 实现旧存档显式迁移为暗月及世界命名空间 save slot，覆盖本地/云 payload 兼容测试
- [x] 2.3 为 world_knowledge_chunks 增加世界/地图作用域、回填/索引与 seed/retrieval 过滤，并验证 schema

## 3. 在线回合与叙事

- [x] 3.1 扩展 chat client structured context 的世界字段并在服务端校验世界/地图边界
- [x] 3.2 接入按世界选择的 stable prompt、第三人称星逆 style profile 和双向污染 validator
- [x] 3.3 接入青石县确定性移动、固定实体、玄幻 world_delta validator 与权威 turn commit
- [x] 3.4 保持 SSE/keys_missing/final hooks/analytics/world tick 契约并增加暗月、星逆合同测试

## 4. 产品入口与游玩 UI

- [x] 4.1 在世界选择页开放「星逆·太初」并持久化选择、发送 world_selected analytics
- [x] 4.2 将角色创建按世界配置，支持落魄散修与青木/赤火/玄水灵根
- [x] 4.3 在 /play 复用现有动作链增加轻量确定性地图与玄幻修为面板，保持暗月 test id 和结构兼容

## 5. 验证与收口

- [x] 5.1 增加星逆创建到升仙试解锁出口的 E2E，并验证刷新/继续/双世界存档
- [x] 5.2 运行相关 unit/golden、content validation、lint、chat contract、mock benchmark、narrative safety 与 build

  验证记录：星逆相关 Node tests 61/61、retrieval Vitest 4/4、`content:validate`、lint（0 errors，120 个既有 warnings）、build、星逆 SSE/多世界 contract 和完整纵切 E2E 均通过。全量 chat contract 的强制 `keys_missing` header 受本地 `.env` 网关配置加载影响，独立端口仅验证了兼容 SSE final 形状；mock benchmark 的正式样本因既有 narrative 长度 276/560 未达预算而失败；narrative-safety mock 两次运行 119 cases 均长时间无阶段输出，已中止并保留为评测耗时阻塞。未放宽任何真实预算或契约断言。
- [x] 5.3 在 390×844、393×852、430×932 验证 /play，使用 frontend-design-review Mode 1 修复确认问题并复测
- [x] 5.4 校验 OpenSpec change 并同步完成的 delta specs，保留 change 未归档
