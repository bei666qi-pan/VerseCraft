## 1. 本次修复范围（一期闭环）

本期把 VerseCraft 四条主线做成可工程化灰度与可回滚的“闭环组合”：

- **职业**：从“后台资格标签”升级为“可见倾向 → 被签发者看见 → 叙事授予试炼 → 认证 → 留下身份痕迹”的身份玩法闭环。
- **武器**：从“状态面板 + 复制指令”升级为“武器化预览 → 装备策略 → 污染/维护 → 再选择”的对策闭环。
- **可玩性**：让系统层能消费三主循环（生存/关系/调查）的 compact packets，使职业/武器/任务/图鉴/关系在同一套“为何值得推进”摘要上咬合。
- **后台**：建立统一 actor 模型（登录用户/游客同口径），并用 session clock（online/active/read/idle）替代“靠 completion 次数近似在线时长”的粗糙口径；让游客不再在后台全是 0/null。

硬约束遵守：
- 不推翻现有 UI 框架、JSON 契约、SSE 结构、主游玩链路。
- 不引入侵入式指纹或骚扰式弹窗。
- 所有增强都以“复用现有状态与后端已知事实”为优先，不额外加前台埋点负担。

---

## 2. 核心链路变化（从并列系统 → 咬合闭环）

### 2.1 运行时上下文（DM）统一入口

- `src/lib/playRealtime/runtimeContextPackets.ts` 在权威 JSON packets 中加入：
  - `survival_loop_packet`
  - `relationship_loop_packet`
  - `investigation_loop_packet`
  - 并将 `world_feel_packet` 的生活底噪与循环提示合并（受开关控制）

这些 packets 让“下一步为什么值得玩”不再靠文案，而是稳定存在于系统层事实源。

### 2.2 职业闭环的产品可见层

- `ProfessionProgress` 新增可选字段：`inclinationVisible/observedByCertifier/trialOffered/trialAccepted/identityImprinted`（旧存档兼容）。
- `useGameStore.getPromptContext()` 注入职业身份 digest + 倾向快照；同时仍保留旧 `职业状态` 行以兼容既有解析/消费点。
- 试炼任务以 `conversation_promise` 等叙事层进入任务系统，并由 certifier 风味差异化。

### 2.3 武器闭环的交互入口

- `WeaponSlotPanel` 用 `queueClientAction` 驱动行动（插入/一键武器化/更换/卸下），不再以“复制指令”为主语义。
- `weaponLifecycle`/`weaponizationPreview`/`weaponPlayerFacingText` 提供生命周期与预览摘要，前台呈现策略与代价（而非开发面板）。

### 2.4 actor/session/guest analytics 闭环

- **统一 actorId**：
  - 登录用户：`u:{userId}`
  - 游客：`g:{guestId}`
- **sessionId 只代表会话**：actor 与 session 一对多，通过 `actor_sessions` 关联。
- **session clock**：通过 `/api/analytics/heartbeat` 与 `actor_sessions/actor_daily_activity` 真实累计 online/active/read/idle。
- **游客不再为 0/null**：dashboard table 从 `analytics_actors + actor_daily_tokens` 汇总游客 tokens/时长/最近活跃等。

---

## 3. 职业身份闭环说明（玩家能感知的进度）

闭环阶段（一期落地）：
- 倾向显露（inclinationVisible）
- 被签发者看见（observedByCertifier）
- 叙事授予试炼（trialOffered）
- 接下证明（trialAccepted）
- 认证（certified）
- 身份痕迹（identityImprinted）

落地方式：
- 进度层是 **可选字段**，由 engine 推导，避免破坏旧档。
- 试炼任务是 **叙事授予的承诺**（conversation_promise），让玩家“知道有人要你证明一件事”。
- 认证后不止改 professionId，而是通过 prompt digest 与系统 hints 改变后续倾向与反馈。

---

## 4. 武器生命周期闭环说明（策略/代价系统）

生命周期（一期落地）：
- raw_material_source → weaponization_previewable/ready → forged/equipped → unstable_or_polluted → needs_maintenance → reforgable

落地方式：
- 预览：显示消耗/费用/风格/风险/适配当前威胁提示。
- 维护：污染/稳定度阈值触发“建议维护/紧急维护”，并给策略摘要（不是数字堆叠）。
- 入口：UI 按钮驱动行动队列（仍走原 chat 链路，保持服务端裁决权）。

---

## 5. 三主循环与世界真实感增强说明

三主循环通过 `*_loop_packet` 被系统层识别：
- **生存**：补给/安全区/维护/时间压力/压制窗口
- **关系**：承诺/债务/交换/折扣/认证见证（一期以提示与承诺层入手）
- **调查**：图鉴/前兆验证/弱点/真相链（一期以“可执行下一步”摘要为主）

世界真实感一期：
- 不讲课，只提供可演出的生活底噪（补给/维修/洗衣/传话/小债务/避让默认存在），并合并进 `world_feel_packet` 的 `living_surface.living_lines`。

---

## 6. actor/session/guest analytics 统一方案

### 6.1 数据表（可控迁移）

新增（不破坏旧表）：
- `analytics_actors`
- `actor_sessions`
- `actor_daily_activity`
- `actor_daily_tokens`

扩展（兼容旧库）：
- `analytics_events` 新增 `actor_id/actor_type/guest_id` 与时长 delta 字段。

旧表仍保留：
- `user_sessions/user_daily_activity/user_daily_tokens/admin_metrics_daily`（用于兼容既有管理端与旧口径）

### 6.2 在线时长口径（session clock v1）

- onlineSec：心跳间隔累计（gap clamp 防爆）
- activePlaySec：可见且近期交互
- readSec：可见但无交互
- idleSec：不可见（hidden）

### 6.3 游客回流识别

- 同一 `guestId` 跨 session → 同一 `g:{guestId}` actor。
- admin/retention/cohort 逐步从“注册用户 cohort”迁移到“actor cohort”。

---

## 7. 后台准确性修复说明（从能看个大概 → 有判断力）

关键变化：
- 游客不再只靠 feedback/survey 拼名单；核心 tokens/时长/最近活跃来自 actor rollups。
- 职业/武器指标不新增前台埋点：复用 chat 侧已知的 `playerContext`，压成 compact digest 写入 `analytics_events.payload`（不存叙事文本）。
- admin 能回答“怎么活/怎么掉/怎么留”的链路问题，而不仅是 DAU/token。

---

## 8. 灰度建议（12 个开关分组）

建议按风险从低到高逐步放量：

1) **后台只读增强**（最安全）
- VERSECRAFT_ENABLE_ADMIN_PLAYSTYLE_METRICS=1

2) **运行时 packets 增强（不改变行为，只增加上下文）**
- VERSECRAFT_ENABLE_PLAYABILITY_CORE_LOOPS_V1=1
- VERSECRAFT_ENABLE_WORLD_FEEL_LOOP_PACKETS=1

3) **职业闭环增强（中风险：影响任务/提示倾向）**
- VERSECRAFT_ENABLE_PROFESSION_IDENTITY_LOOP=1
- VERSECRAFT_ENABLE_PROFESSION_TRIAL_NARRATIVE_GRANT=1

4) **武器闭环增强（中风险：前台入口变化）**
- VERSECRAFT_ENABLE_WEAPON_LIFECYCLE_V1=1
- VERSECRAFT_ENABLE_WEAPONIZATION_PREVIEW=1

5) **analytics 结构增强（中风险：写入链路，需关注 DB/索引）**
- VERSECRAFT_ENABLE_ACTOR_IDENTITY_ANALYTICS=1
- VERSECRAFT_ENABLE_GUEST_UNIFIED_METRICS=1
- VERSECRAFT_ENABLE_SESSION_CLOCK_V1=1

---

## 9. 风险与回滚策略

- **风险：指标口径切换导致图表波动**
  - 回滚：关 `VERSECRAFT_ENABLE_ADMIN_PLAYSTYLE_METRICS`，管理端退回旧 cards/旧 charts。
- **风险：runtime packet 体积增长影响 TTFT**
  - 回滚：关 `VERSECRAFT_ENABLE_PLAYABILITY_CORE_LOOPS_V1` / `VERSECRAFT_ENABLE_WORLD_FEEL_LOOP_PACKETS`。
- **风险：职业试炼任务影响玩家任务列表**
  - 回滚：关 `VERSECRAFT_ENABLE_PROFESSION_TRIAL_NARRATIVE_GRANT`，停止注入试炼承诺。
- **风险：心跳写入带来 DB 压力**
  - 回滚：关 `VERSECRAFT_ENABLE_SESSION_CLOCK_V1`，/api/analytics/heartbeat 变为 skipped。
- **风险：客户端武器预览影响 UI 负载**
  - 回滚：关 `NEXT_PUBLIC_VERSECRAFT_ENABLE_WEAPONIZATION_PREVIEW` 与 `NEXT_PUBLIC_VERSECRAFT_ENABLE_WEAPON_LIFECYCLE_V1`（只影响前台展示，不影响主链路）。

---

## 10. 验收案例（与测试矩阵对齐）

- 职业：倾向可见 → 被 certifier 看见 → 试炼以承诺形式出现 → 认证后反馈改变。
- 武器：能看到武器化预览 → 污染升高触发维护建议 → 决策张力出现。
- 三主循环：runtime packets 可被系统消费且不截断。
- analytics：同一 guestId 跨 session 归一 actor；游客后台有真实 tokens/时长/最近活跃；admin 能聚合职业/武器/引导/回流指标。

---

## 11. 二期可做项（本期刻意不做，避免过度设计）

- 更精确的“首次武器化成功”判定（基于 `weapon_updates` 明确 forged/weaponize 成功，而非意图识别）。
- first10MinDeathRate 的严格定义与落地（需要在 turn resolve/结算处记录“死亡发生时间窗”事件，避免从客户端推断）。
- 游客注册后的 merge/alias 全链路（需要明确登录/注册回调点把 g:actor 与 u:actor 关联并可追溯）。
- adminMetricsDaily 的 actor 口径重算与迁移（避免一期就改动历史图表口径）。

