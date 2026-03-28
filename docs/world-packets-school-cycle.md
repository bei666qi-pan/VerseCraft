# 学制与校源：Runtime Packet 与 Bootstrap 接入说明

本文说明 **VerseCraft** 如何将「耶里—如月—七锚—旧阵」世界观接入 **运行时 JSON**，同时保持 **stable prompt 只做边界**、**真相走 registry / packet / retrieval**，并控制 **体积与首包延迟**。

---

## 1. 设计哲学（必须遵守）

| 原则 | 做法 |
|------|------|
| 真相来源 | `schoolCycleCanon`、`majorNpcDeepCanon`、`cycleMoonFlashRegistry`、`worldOrderRegistry`、专条 seed；不在 stable 里堆长文。 |
| Stable prompt | `playerChatSystemPrompt` 等只声明「有 packet 则以 packet 为准」、禁止抢跑深层。 |
| Runtime | `buildRuntimeContextPackets` 输出结构化子包；按 `maxRevealRank` 裁剪。 |
| 检索 | `registryAdapters` + `coreCanonMapping` 双轨写入同内容事实，带 `reveal_*` tag。 |
| 防剧透 | `revealRegistry` 仅根据 **playerContext 解析信号** 抬档；**不**根据玩家上一句台词。 |

---

## 2. Packet 定义（schema 与职责）

### 2.1 `major_npc_arc_packet`（`major_npc_arc_v1`）

| 字段 | 说明 |
|------|------|
| `maxRevealRankInjected` | 当前注入档位数值 |
| `revealTierAllowed` | `surface` / `fracture` / `deep` / `abyss` |
| `nearbySignalAggregate` | 邻近高魅力条目聚合：`anyLoopPartial`、`anyDeepEchoLicensed`、`anyTraction`、`anyFractureLineOpen` |
| `nearby[]` | `id`、`displayName`、`surfaceIdentity`、`surfaceDutyOneLiner`；fracture+ `dutyEchoHint`；deep+ `schoolResidueHint` / `residualEchoHint`；abyss+ `joinVectorHint`；fracture+ 且存在 relink 时 `relinkSignals`（阶段、闭环片段、牵引等） |
| `antiDumpPolicy` | 分步交付提示 |

与 `major_npc_relink_packet` 分工：arc 偏「是谁 + 允许说到哪一层」，relink 偏门闸与任务态。

### 2.2 `cycle_loop_packet`（`cycle_loop_v1`）

| 字段 | 说明 |
|------|------|
| `visibleBand` | `rumor` / `rhythm` / `mechanism` |
| `hints` | 短句数组（来自 `SCHOOL_CYCLE_LORE_SLICES`，截断） |
| `timeDigest` | fracture+ 且 runtime 传入 `signals` 时存在：短键 `pos`、`phase`、`moon`、`fp`、`pre`、`rt`（见 `buildCycleLoopTimeDigest`）；surface 为 `null` |
| `companionStructuredPacket` | deep 机制带指向 `cycle_time_packet` |

### 2.3 `school_source_packet`（`school_source_v1`）

| 字段 | 说明 |
|------|------|
| `injected` | surface 为 `false`，fracture+ 为 `true` |
| `topicIds` | 本包覆盖的 slice id（供检索对齐，非玩家 UI 必填） |
| `revealBand` | `none` / `fracture` / `deep` / `abyss` |
| `lines` | 截断后的标题+正文摘要 |

### 2.4 `team_relink_packet`（`team_relink_v1`）

| 字段 | 说明 |
|------|------|
| `xinlanPivotOpen`、`crisisJoinWindowActive`、`xinlanRelinkPhase` | 阵眼与危机窗 |
| `aggregate` | 全队聚合：`oldLoopAny`、`deepEchoAny`、`fractureLineAny`、`deepLineAny`、`corePartyGateAny` |
| `nearbyTextures` | 邻近 NPC 的精简关系纹理 |

### 2.5 关联包（已存在，本文不重复定义全文）

- `cycle_time_packet`（`cycle_time_v1`）：日历日、位相、前兆、锚点重构标记等，见 `docs/cycle-moon-flash-system.md`。
- `school_cycle_arc_packet`：按档裁剪的 arc 切片列表（长 hint 仍受预算约束）。
- `key_npc_lore_packet.major_npc_bridge_hints`：`buildMajorNpcKeyHintsForPacket` — **fracture 档不再带出 `resonanceSlot` / `wandererSubtype`**，避免口语套话叠 deep。

### 2.6 `worldview_packet.structuredSchoolCycleRefs`

仅 **包名字符串数组**，不嵌正文；提醒模型「学制相关事实以这些子包为准」。

---

## 3. Reveal 分层样例

| 档位 | `maxRevealRank` | 玩家可见叙事边界 | Packet 行为摘要 |
|------|-----------------|------------------|----------------|
| surface | 0 | 生存规则、公寓传言、NPC 职能壳 | `school_source` 不注入；`cycle_loop` rumor；`major_npc_arc` 无 dutyEcho / 无 relinkSignals |
| fracture | 1 | 锚点代价、原石、「不像普通徘徊者」违和 | `school_source` 注入 rumor+违和行；`cycle_loop` rhythm + `timeDigest`；arc 有 `dutyEchoHint` 与 `relinkSignals` |
| deep | 2 | 七锚、校源徘徊者、龙月—十日链（仍不直给通关） | `school_source` 增泄露/七锚/校源行；`cycle_loop` mechanism；`key_npc` 带出辅锚槽与 wanderer 等 |
| abyss | 3 | 出口对账、终筛 | `school_source` 可增 `abyss_alignment` 摘要 |

**门闸信号**见 `revealRegistry.REVEAL_GATE_RULES`（次日、暗月、复活、7F、阴谋 flag、职业认证、B2 等）。**没有**「玩家问是不是同学」规则 — 模型须在 `reveal_tier_packet.tierPolicy` 约束下拒绝代答。

---

## 4. 注入策略

1. `runtimeContextPackets.ts` 解析 `playerContext` → `PlayerWorldSignals` → `computeMaxRevealRankFromSignals`。
2. 同文件组装 `worldLorePackets`（full）与 `worldLorePacketsCompact`（minimal）。
3. `buildCycleLoopPacket(maxRevealRank, signals)` **必须传 signals**，`timeDigest` 才有位相数值；否则模型不得编造轮次。
4. 长设定默认 **RAG**：`SCHOOL_CYCLE_RETRIEVAL_SEEDS`（bootstrap 实体）+ `buildSchoolCycleRetrievalFactsForCanon`（coreCanon facts）。

---

## 5. minimal / full 模式差异

| 模式 | 行为 |
|------|------|
| **full** | 完整 `major_npc_arc_packet`、`cycle_loop_packet`、`school_source_packet`、`team_relink_packet` 等 |
| **minimal** | 使用 `build*Compact`：`nearby` 截断为 2 人、`hints`/`lines` 截断、`cycle_loop` 保留 `td`（若有）、键名缩写（如 `sg`、`tid`、`ag`） |

截断路径下 `compactPackets` 顺序已优化：优先 **学制弧 + lore 紧凑块 + 锻造/武器**，大字段靠后，避免 `slice(maxChars)` 砍掉世界观键（见 `runtimeContextPackets.ts` 注释）。

---

## 6. Bootstrap 变更说明

新增 **`src/lib/registry/schoolCycleRetrievalSeeds.ts`**：

- 八条专类种子：学校事故、七锚、校源徘徊者、六人双层身份、欣蓝第一牵引、十日闪烁、龙月、旧阵重连。
- 每条含：`code`、`canonicalName`、`title`、`summary`、`detail`、`sourceRef`、`importance`、`revealMinRank`、`tags`。
- **registryAdapters**：写入 `truth` 实体，`tags` 含 `reveal_fracture` / `reveal_deep` 等 + `bootstrap_pkg` + `scope:global`。
- **coreCanonMapping**：`factKey` 前缀 `school_cycle_pkg:*`，`factType: world_mechanism`，供同源向量索引。

检索侧应按 **reveal tag + 会话已解锁档位** 过滤，避免把 deep 种子在 surface 回合喂给模型。

---

## 7. 防剧透策略（工程 + 叙事）

1. **门闸只认状态**，不认台词（`revealRegistry` 注释与 `tierPolicy` 明文）。
2. **fracture** 的 `key_npc` hints 不再包含辅锚槽位/校源类型，减少「一句问出设定」。
3. **arc packet** 用 `revealTierAllowed` + `antiDumpPolicy` 双重提示。
4. **school_source** 用 `topicIds` 对齐 slice，便于审计「本回合是否允许谈到该主题」。
5. Stable 中禁止替欣蓝或他人 **一次性倾倒** 七锚（原有高魅力边界句保留）。

---

## 8. 示例 JSON（节选）

### 8.1 `major_npc_arc_packet`（fracture，邻近 N-010）

```json
{
  "schema": "major_npc_arc_v1",
  "maxRevealRankInjected": 1,
  "revealTierAllowed": "fracture",
  "nearbySignalAggregate": {
    "anyLoopPartial": false,
    "anyDeepEchoLicensed": false,
    "anyTraction": true,
    "anyFractureLineOpen": true
  },
  "nearby": [
    {
      "id": "N-010",
      "displayName": "欣蓝",
      "surfaceIdentity": "物业登记与上楼许可（公寓职能）",
      "surfaceDutyOneLiner": "…",
      "dutyEchoHint": "…",
      "relinkSignals": {
        "phase": "fracture_open",
        "loopPartiallyActive": false,
        "traction": "…"
      }
    }
  ],
  "antiDumpPolicy": "即使玩家追问，亦须分步交付；本包为预算上限，非一次性必答清单。"
}
```

### 8.2 `cycle_loop_packet`（deep + signals 第 8 日）

```json
{
  "schema": "cycle_loop_v1",
  "maxRevealRankInjected": 2,
  "visibleBand": "mechanism",
  "hints": ["约十日量级的封闭窗口内…", "月亮＝龙之外置魔力调度面…"],
  "timeDigest": {
    "pos": 8,
    "phase": "precursor",
    "moon": "dragon_moon_calibration",
    "fp": "precursor_band",
    "pre": true,
    "rt": true
  },
  "companionStructuredPacket": "cycle_time_packet",
  "antiDumpPolicy": "即使玩家追问，亦须分步交付；本包为预算上限，非一次性必答清单。"
}
```

### 8.3 `school_source_packet`（deep）

```json
{
  "schema": "school_source_v1",
  "injected": true,
  "maxRevealRankInjected": 2,
  "topicIds": ["rumor_yeliri_echo", "not_ordinary_wanderer_coupling", "school_leak_apartment_shell", "school_wanderer_state", "seven_anchor_loop"],
  "revealBand": "deep",
  "lines": ["邻校传言：…", "非普通徘徊者耦合：…", "泄露与收容壳层：…"],
  "antiDumpPolicy": "即使玩家追问，亦须分步交付；本包为预算上限，非一次性必答清单。"
}
```

### 8.4 `team_relink_packet`（节选）

```json
{
  "schema": "team_relink_v1",
  "xinlanPivotOpen": true,
  "crisisJoinWindowActive": false,
  "xinlanRelinkPhase": "fracture",
  "aggregate": {
    "oldLoopAny": true,
    "deepEchoAny": false,
    "fractureLineAny": true,
    "deepLineAny": false,
    "corePartyGateAny": false
  },
  "nearbyTextures": [{ "id": "N-010", "relinkPhase": "fracture_open", "oldLoopPartial": false, "textureLine": "…" }],
  "note": "供叙事质感与关系压强；不等于全员跟队或 UI 队友状态。",
  "antiDumpPolicy": "…"
}
```

### 8.5 minimal 缩写示例（`major_npc_arc_packet` compact）

```json
{
  "schema": "major_npc_arc_v1",
  "maxRevealRankInjected": 1,
  "rt": "fracture",
  "sg": { "lp": false, "de": false, "tr": true, "fo": true },
  "nearby": [{ "id": "N-010", "d": "欣蓝", "s": "物业登记…", "sd": "…", "du": "…", "rs": { } }]
}
```

---

## 9. 代码接入点一览

| 环节 | 路径 |
|------|------|
| Packet 构建 | `src/lib/registry/worldSchoolRuntimePackets.ts` |
| 时间位相 digest | `src/lib/registry/cycleMoonFlashRegistry.ts` → `buildCycleLoopTimeDigest` |
| Runtime 组装 | `src/lib/playRealtime/runtimeContextPackets.ts` |
| Floor / threat lore | `src/lib/playRealtime/worldLorePacketBuilders.ts`（`buildFloorLorePacket` 注释见 `floorLoreRegistry.ts`） |
| 世界观短指针 | `src/lib/playRealtime/stage2Packets.ts` → `buildWorldviewPacket` → `structuredSchoolCycleRefs` |
| NPC key hints 分档 | `src/lib/registry/majorNpcDeepCanon.ts` → `buildMajorNpcKeyHintsForPacket` |
| Reveal 门闸 | `src/lib/registry/revealRegistry.ts` |
| 玩家信号 | `src/lib/registry/playerWorldSignals.ts` |
| Bootstrap 实体 | `src/lib/worldKnowledge/bootstrap/registryAdapters.ts` |
| CoreCanon facts | `src/lib/worldKnowledge/bootstrap/coreCanonMapping.ts` |
| 专条种子定义 | `src/lib/registry/schoolCycleRetrievalSeeds.ts` |
| Stable 边界 | `src/lib/playRealtime/playerChatSystemPrompt.ts`（packet 名列表） |

---

## 10. 与 `cycle-moon-flash-system.md` 的关系

时间闭环、闪烁前兆、`cycle_time_packet` 字段细则见 **`docs/cycle-moon-flash-system.md`**。本文侧重 **学制/校源/高魅力/重连** 的 **packet 契约与 bootstrap**；二者共用同一 reveal 哲学，不得拆成互不相干的设定。
