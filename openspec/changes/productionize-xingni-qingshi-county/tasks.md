## 1. 生产内容包

- [x] 1.1 拆分并登记五章十四阶段主线、三艺链、八条 NPC 支线、四类重复委托和十二个确定性事件
- [x] 1.2 补齐八名 NPC 四时段日程、关系/服务/reveal 事实，以及敌人、物品、商店与配方内容
- [x] 1.3 扩展 content validator，校验可达性、唯一 ID、完整引用、唯一金丹、经济无套利和青云渡无内容

## 2. 状态、迁移与权威裁决

- [x] 2.1 实现 XingniTaichuState v2 与旧星逆状态兼容归一化，保持暗月和快照契约
- [x] 2.2 实现统一登记 action envelope、幂等处理、任务/时间/NPC 在场和服务条件裁决
- [x] 2.3 实现三灵根多解法、修炼突破、交易炼制、战斗四档、重伤回退、升仙试和六步救济
- [x] 2.4 将新版 world_delta 接入青石县 guard 与 resolveDmTurn，并拒绝跨世界、未知实体和叙事越权

## 3. Prompt、知识与 UI

- [x] 3.1 升级星逆 stable prompt/runtime packet 和 golden 场景，加入当前任务、时段、在场 NPC、伤势与合法行动切片
- [x] 3.2 扩展 world knowledge 幂等 seed 与作用域测试，覆盖 NPC 日程、任务公开事实、服务和敌人物品
- [x] 3.3 扩展星逆地图面板，展示目标、修为伤势体力、资源、时间、在场 NPC、服务状态、失败恢复与锁定出口
- [x] 3.4 将图鉴目录、未读统计、名称解析与自动捕获按世界分流，星逆只登记八名青石县 NPC 并投影当前日程位置
- [x] 3.5 为八名青石县 NPC 生成独立的明亮东方玄幻立绘，并输出图鉴所需 PNG/AVIF/WebP 多密度资源

## 4. 自动化验收

- [x] 4.1 增加内容、迁移、灵根、经济、任务状态机、失败恢复、幂等和反软锁 unit/property tests
- [x] 4.2 增加 prompt/POV/reveal/污染、SSE/final/keys_missing 和权威实体 contract/golden tests
- [x] 4.3 增加青木、赤火、玄水三路线、重伤恢复、零资源救济、NPC 错时与双存档 E2E
- [x] 4.4 在 390×844、393×852、430×932 完成 UI E2E，并在实现可运行后执行 frontend-design-review Mode 1、修复并复测
- [x] 4.5 增加星逆图鉴目录、自动捕获、名称/头像解析契约测试，并在三种目标视口复核无暗月内容串台

## 5. 生产验证与规格同步

- [x] 5.1 运行相关 unit/golden、content validate、lint、contract E2E、星逆 E2E、mock benchmark/evals 和 build
- [x] 5.2 在 PostgreSQL 环境验证 schema、暗月回填、星逆重复 seed、索引与世界过滤；记录无法执行的外部阻塞
- [x] 5.3 strict validate change 并同步 delta specs 至主规格，保留 change 未归档并记录真实验证结果

### 验证记录

- 星逆/迁移/seed/JSON schema/turn commit 合集 52/52 通过；`content:validate` 通过。
- `pnpm lint` 0 errors、120 个仓库既有 warnings；`pnpm build` 通过，保留 instrumentation Edge Runtime 既有 warnings。
- 星逆纵切、三灵根创建与 390×844、393×852、430×932 共 7/7 E2E 通过。Mode 1 复核修复了服务时段误导和重伤零资源软锁。
- 星逆图鉴目录、自动捕获、名称/头像、记忆显示和卡片选中态 62/62 通过；内置浏览器在 390×844、393×852、430×932 实测 8 张星逆卡、0 张暗月卡、头像成功加载、选中人物首屏可见、无内部 ID、无横向溢出，console 无错误或警告。
- `test:e2e:contract` 5 passed、6 按环境跳过；production 星逆 E2E 原样复跑 7/7，完整纵切约 7.9 秒。
- `eval:narrative-style:mock` 91/91 通过；以 `react-server` 条件运行 `eval:npc-consistency:mock` 8/8 通过。
- PostgreSQL `db:check:optional` 连接和必需表通过；生产 seed 首次 354 entities/640 chunks，第二次 tagsUpserted=0，证明幂等。
- `benchmark:chat:mock` quality 10/10，first status p95 17ms、first token p95 313ms、final p95 573ms；`eval:narrative-safety:mock` 119 cases 全指标 1.000 并通过 gate。`eval:intent-grounded-playability` 的 22 个 live case 因未启用 live 条件保持 not_run/inconclusive。
- 真实 DeepSeek 星逆回合返回权威 `world_delta`，无 `site_unavailable`；NPC 敏感事实边界使柳三娘只陈述已登记 `XQ-F013`，不会补造价格、资格或手续。星逆 fallback 与污染扫描同时阻断暗月走廊、灯管等串台。
- 真实异步 Director 探针经 PostgreSQL、队列、worker、`deepseek-v4-flash` reasoner、validator、agenda、director state 和下一回合 consumer 全链通过；run 1796 / revision 1176 写入 agenda 106 并消费 hint。SQL 重用参数使用显式 cast，登记 ID 与 NPC 日程输入收紧；仅对已登记、低风险且无权威状态语义的青石县微事件补服务器固定自主性边界，未知、高风险、奖励或任务事件继续 fail closed。相关 Director/runtime/persistence 回归 45/45 通过。
- change strict validation 和本次新增/修改主规格单项 validation 均通过；全量主规格仍有 5 个仓库既有 spec validation failures，与本 change 无关。
