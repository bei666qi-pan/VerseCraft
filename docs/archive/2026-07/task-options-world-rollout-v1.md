## 本次修复范围（一期）

本期只做“可灰度、可回滚、玩家立刻可感知”的工程化落地，覆盖四条主链路：

- **任务入口与职责边界**：设置页回归控制中枢；任务栏（`PlayTaskPanel`）为唯一正式任务入口。
- **任务显隐与叙事授予**：系统有任务 ≠ 玩家该看见；soft_lead/承诺/正式任务三层明确；formal_task 仅在叙事接下后上板。
- **选项生成稳定性**：主回合 options 缺失不再默认接受；自动补全 + 手动“重新整理选项”走稳定 options-only 链路。
- **新手体验与世界真实感**：老刘=生存教官、麟泽=边界教官；月初误闯与生活型世界底噪进入可消费 runtime packet。

非目标（一期刻意不做）：

- 不做新的“复杂经济/债务系统”、不做完整 NPC 日程模拟、不做大规模 UI 视觉重做、不引入新的协议形状。

---

## 核心链路变化（高层）

- **UI 入口**：
  - 设置页默认不渲染任务板；任务入口只在顶部任务按钮打开的 `PlayTaskPanel` 中出现。
- **任务显隐**：
  - 引入 `TaskGrantState` + `taskVisibilityPolicy`，并在 `taskBoardUi` 消费可见层级：
    - soft_lead：默认只作为线索影子（clue）
    - conversation_promise：进入承诺/风险带（promise lane）
    - formal_task：叙事接下后才进入主任务区（board_visible）
- **任务授予 → UI hint**：
  - formal_task 在叙事中“接下/接受”后，服务端生成 `ui_hints.auto_open_panel="task"` + `highlight_task_ids`。
- **选项生成**：
  - options-only 独立链路：`clientPurpose="options_regen_only"` 走 server fast path，不污染世界状态。
  - 主回合 options 为空：服务端 post-resolve 补一次 options；客户端也可在缺失时自动触发一次补全（均可灰度）。
- **世界质感**：
  - 注入 `world_feel_packet`：空间权柄“同源错位感”、月初误闯压力、生活底噪证据（补给/维修/洗衣/看守/交易/传话/小债务）。

---

## 新任务显隐规则（一期标准）

- **hidden**：绝不显示（UI 与任务板均不应出现）
- **soft_lead**：默认不进入正式任务主视图；只允许进入“线索影子”轻展示
- **conversation_promise**：可轻追踪（承诺/风险带），不抢主任务区
- **formal_task**：必须满足 “narratively_offered + accepted_in_story（或等价）” 才进入主任务区并可高亮

这保证：

- 新手期不会被任务板信息淹没
- “任务板”更像“我真正拿在手里的事”，而不是系统待办清单

---

## 任务栏与设置页职责边界

- **设置（Settings）**：属性/武器/职业/音量/退出等控制中枢，不承担任务入口。
- **任务栏（Task Panel）**：唯一正式任务入口，承载“当前目标与承诺”。
- **回滚能力**：在需要紧急回滚时，可通过 flag 让设置页重新渲染任务板（仅用于紧急回滚/对照观测，不作为长期产品形态）。

---

## 选项自动补全与手动重生方案

### 自动补全（主回合 options 为空）

- **服务端**：在 `resolveDmTurn` 之后，如果 options 被裁剪/去重后不足，且不属于首轮/结算冻结等跳过条件，则调用 options-only 生成补齐一次。
- **客户端**：若主回合 options 为空，且不是首轮，可自动触发一次 `options_regen_only` 请求（单次防抖，避免循环）。

### 手动重生（按钮“重新整理选项”）

- 走 `clientPurpose="options_regen_only"` 的独立链路：
  - **不推进剧情、不修改世界状态**
  - **只返回 `{"options":[...4条...]}`**
  - 上下文聚焦：最近玩家动作 + 最近叙事片段 + 轻量 playerContext snapshot

---

## 老刘与麟泽的新手引导方案（10–20 分钟）

- **双主轴**：
  - 老刘（N-008）= 生存教官：活命/工具/退路/电/物资/别逞能
  - 麟泽（N-015）= 边界教官：边界/秩序/越界代价/B1为何安全/什么不能碰
- **接入点**：
  - `new_player_guide_packet` 注入 runtime：提供“写作锚点”与反抢戏规则（高魅力 NPC 不得抢主导）。
  - NPC 心脏 prompt：对 N-008/N-015 强化“行为锚”，避免同质化成解说员。

---

## 世界真实感增强方案（一期最小集合）

- **空间权柄闭环表层化**：用错位、回声、规则相似、节律来让玩家“先感觉到同源”，禁止讲课。
- **月初误闯学生压力**：作为住户共识与公寓生活逻辑进入 packet，让玩家感到“我不是唯一特例”。
- **生活型底噪证据**：补给/维修/洗衣/看守/交易/传话/小债务进入可消费 runtime packet，强化“世界一直在运转”。

---

## 灰度建议（Coolify 可直接配）

推荐顺序（由低风险到高价值）：

1. 开：`VERSECRAFT_ENABLE_WORLD_FEEL_PACKETS`、`VERSECRAFT_ENABLE_MONTH_START_STUDENT_WORLDLOGIC`
2. 开：`VERSECRAFT_ENABLE_NEW_PLAYER_GUIDE_DUAL_CORE_V2`
3. 开：`VERSECRAFT_ENABLE_OPTIONS_ONLY_REGEN_PATH_V2`、`VERSECRAFT_ENABLE_OPTIONS_AUTO_REGEN_ON_EMPTY`
4. 开：`VERSECRAFT_ENABLE_TASK_VISIBILITY_POLICY_V3`、`VERSECRAFT_ENABLE_TASK_AUTO_OPEN_ON_NARRATIVE_GRANT`、`VERSECRAFT_ENABLE_PLAYER_FACING_TASK_COPY_V2`
5. 最后确认：`VERSECRAFT_ENABLE_SETTINGS_TASK_REMOVAL`

---

## 风险与回滚策略

- **任务入口争议**：若反馈“找不到任务”，可临时关 `VERSECRAFT_ENABLE_SETTINGS_TASK_REMOVAL` 恢复设置页任务板渲染（并配合指标看回流）。
- **任务显隐误判**：关 `VERSECRAFT_ENABLE_TASK_VISIBILITY_POLICY_V3` 回落旧逻辑（保留数据结构兼容）。
- **auto open 过吵**：关 `VERSECRAFT_ENABLE_TASK_AUTO_OPEN_ON_NARRATIVE_GRANT`。
- **选项自动补全误触发**：关 `VERSECRAFT_ENABLE_OPTIONS_AUTO_REGEN_ON_EMPTY`（仍可保留手动重生）。
- **options-only 链路异常**：关 `VERSECRAFT_ENABLE_OPTIONS_ONLY_REGEN_PATH_V2`，仍保持 options-only 但不走 V2 严格 packet（不污染世界状态）。
- **世界质感信息过多**：关 `VERSECRAFT_ENABLE_WORLD_FEEL_PACKETS` 或单独关 `VERSECRAFT_ENABLE_MONTH_START_STUDENT_WORLDLOGIC`。

---

## 验收案例（对应测试矩阵）

- 设置页不再显示任务板；顶部任务按钮可打开任务栏（e2e）。
- soft_lead 不进入正式任务主视图；promise 进入轻追踪；formal_task 叙事接下后上板并可高亮（unit + golden）。
- 主回合 options 缺失自动补齐；手动“重新整理选项”稳定返回 4 条（unit + golden/解析兜底）。
- 新手期双主轴 packet 命中；NPC 社交表层可演；月初误闯与空间错位在 packet 中可感知（golden）。
- minimal/full/fast lane 关键边界键保持一致（golden）。

---

## 二期可以做什么（但本期故意不做）

- 生活型机制：小债务/借物/传话做成轻量可结算系统（但会牵动经济与 UI，本期不碰）。
- 月初机制：把“月初节律”与时间推进更深度联动（会影响主线节奏，本期不碰）。
- 更强的 NPC 日程与避让：做真实巡回与同场冲突（系统复杂度高，本期不碰）。

