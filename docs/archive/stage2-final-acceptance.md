# Stage2 Final Acceptance

## 目标

第二阶段聚焦三件事：楼层主威胁系统、武器最小版、轻锻造最小版。目标是形成可玩的回路，而不是扩写设定。

核心回路：

`上楼探索 -> 识别主威胁与代价 -> 带回收益/创伤 -> B1整备(修复/改装/灌注) -> 再上楼`

## 全链路验收结果

已通过代码级联调（tests）验证以下链路：

1. B1 可查看锻造台与可执行动作
2. 上楼错误应对后主威胁 phase 可升高（如 breached）
3. 正确应对可进入 suppressed 并提供窗口
4. 回到 B1 可执行修复/改装/灌注
5. 锻造成功时 narrative 与 state 同步落盘（weapon_updates / currency_change / consumed_items）
6. 运行时 packet 同步注入 threat/weapon/forge/tactical 信息

关键测试文件：

- `src/lib/playRealtime/stage2GameplayLoop.test.ts`
- `src/lib/playRealtime/serviceExecution.test.ts`
- `src/lib/playRealtime/mainThreatGuard.test.ts`
- `src/lib/playRealtime/settlementGuard.test.ts`
- `src/lib/playRealtime/stage2Packets.test.ts`
- `src/lib/playRealtime/runtimeContextPackets.test.ts`

## 平衡与节奏结论

- **1F/2F/3F 递增**：通过 `floorThreatTier` 与主威胁 phase 演进体现，2F 起压迫显著。
- **武器不越权**：武器提供“应对窗口”而非数值碾压，不引入传统伤害公式。
- **锻造不 grind**：轻锻造只做三类操作，材料复用现有道具/仓库，不引入重经济。
- **B1 整备中枢成立**：锻造仅在 `B1_PowerRoom` 且需服务可用与 NPC 在场。
- **任务驱动继续上楼**：任务文本与 tactical packet 会引导威胁压制与下一轮准备。

## 范围边界（保留 / 删除）

### 保留（Stage2 必要）

- 主威胁 phase/suppression 的系统回写
- 武器稳定度/污染/模组/灌注
- 轻锻造三操作：repair/mod/infuse
- B1 服务守卫与结构化 packet 注入

### 删除或禁止（Stage2 不做）

- 大配方树 / 复杂材料经济
- 大词条池 / 套装系统
- 大量新武器与刷怪掉落循环
- 职业终版路线
- 重型 RAG infra / 大地图重构

## DM Packet 架构补充

stable prompt 仅负责：

- 合规
- JSON 契约
- 叙事风格
- 运行时 packet 优先
- 世界一致性

Stage2 细节全部通过 dynamic packet 注入，不回填到 stable prose。

新增 Stage2 packet builders：

- threat packet
- weapon packet
- forge packet
- floor progression packet
- tactical context packet（含 `requiredWritebacks`）

## Token / 稳定性回归

- stable prompt 体积维持在阈值内（测试约束 `< 6500`）
- runtime packet 预算维持 `maxChars: 2400`
- DM JSON 解析链路保持稳定：`normalize -> stringify -> tryParseDM`

## 第三阶段建议（不在本阶段实现）

1. 把灌注衰减与主威胁压制窗口做更细粒度联动（按 threat type 变化）
2. 加入极少量“任务-锻造联动奖励模板”（仍保持轻量）
3. 增加线上观测图：`requiredWritebacks` 命中率与漏回写率
4. 在不扩大系统的前提下，补 1-2 个高价值剧情化整备分支

