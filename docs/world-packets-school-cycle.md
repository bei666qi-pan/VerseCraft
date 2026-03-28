# 学制循环与高魅力 NPC：Runtime Packet 与 Bootstrap 接入

本文说明世界观/校源/七锚/重连叙事如何经 **registry → reveal 门闸 → runtime packet → world knowledge bootstrap** 进入模型可见域，且**不堆进固定 prompt**。

## 设计原则

- **真相主路径**：`schoolCycleCanon`、`worldArcBootstrapSlices`、`majorNpcDeepCanon`、`majorNpcRelinkRegistry` + 各 packet builder。
- **Stable prompt**：仍只保留最小硬约束；本批改动不增加长文静态 prompt。
- **防剧透**：`maxRevealRank`（`computeMaxRevealRankFromSignals`）统一裁剪；`REVEAL_TIER_METAS` 已写明各档对高魅力 NPC / 校源的边界。
- **体积**：`full` 模式给完整 JSON；`minimal` 与超长截断沿用 `worldLorePacketsCompact` 内的缩写子包，避免首字明显膨胀。

## 揭露分层（与 packet 对齐）

| 档位 | `maxRevealRank` | 模型可见边界（摘要） |
|------|-----------------|----------------------|
| surface | 0 | 生存规则、邻校**传言**、职能壳 NPC；无七锚/校源/循环机制直述 |
| fracture | 1 | 锚点代价、原石与楼层阶段感；**可暗示**关键住户「不像普通徘徊者」；`school_source` 开始注入（仍无七锚/校籍点名） |
| deep | 2 | 七锚结构、校源徘徊者、泄露—收容双端、龙月与十日闪烁提纲、欣蓝情绪锚等 |
| abyss | 3 | 出口对账链提纲；仍带 `antiDumpPolicy`，禁止单句追问一次性倾倒 |

### 三档 `maxRevealRank` 行为示例（同一玩家位置、不同信号）

**1. surface（第 1 日、无复活、无阴谋标记、无 7F）**

- `school_cycle_arc_packet.slices`：仅含「邻校传言」等 surface 切片。
- `cycle_loop_packet.visibleBand`：`rumor`；`hints` 只有短传言。
- `school_source_packet.injected`：`false`，`lines` 空。
- `major_npc_arc_packet.nearby[]`：若有高魅力 NPC 在场，仅 `surfaceIdentity`（`publicMaskRole`），无 `dutyEchoHint`。
- `key_npc_lore_packet.major_npc_bridge_hints`：仅 `publicMaskRole` + surface 档 `revealHints`，无 `wandererSubtype`。

**2. fracture（例如 `day>=2` 或 `deathCount>=1`）**

- `school_cycle_arc_packet`：含「非普通徘徊者耦合」「主锚特性」等，**不含**「七锚分担」「泄露与收容壳层」（已抬到 deep）。
- `school_source_packet.injected`：`true`，`lines` 含传言 + 裂缝耦合说明，**不含**七锚/校源定义长条。
- `major_npc_arc_packet`：含 `dutyEchoHint`、`relinkSignals`（若重连阶段 ≥2）。
- `worldview_packet.b1Meaning`（在 B1）：描述稳定带与服务，**不**写「七锚」字样（七锚用语仅在 deep+）。

**3. deep（例如 `anchor7F` 或 `is7F` 或阴谋类 worldFlags）**

- `school_cycle_arc_packet`：可含七锚、泄露壳层、校源徘徊者、龙月、十日闪烁、原石闭环等切片。
- `school_source_packet.lines`：追加泄露/校源/七锚提纲（截断）。
- `cycle_loop_packet.visibleBand`：`mechanism`。
- `major_npc_arc_packet`：可含 `schoolResidueHint`、`residualEchoHint`。

## 新增 / 强化的 Packet

| Packet | 职责 | 与旧包关系 |
|--------|------|------------|
| `major_npc_arc_v1` | 邻近高魅力 NPC：**是谁**（表层身份 + 分档深提示 + 重连信号） | 与 `key_npc_lore_packet.major_npc_bridge_hints` 互补；本包结构化、按人聚合 |
| `cycle_loop_v1` | 轮回/节律/龙月**可见层**分段（rumor → rhythm → mechanism） | 与 `school_cycle_arc_packet` 互补；本包更短、偏「时间—节律」叙事预算 |
| `school_source_v1` | 校端线索与校源提示；surface 不注入 | 与 `school_cycle_arc_packet` 切片同源，按档**选摘**行，避免重复堆全文 |
| `team_relink_v1` | 邻近 NPC 的**旧闭环重连质感**（阶段、纹理一行） | 与 `major_npc_relink_packet`（规则骨架）互补；本包偏叙事压强 |
| `school_cycle_arc_v1`（既有） | 学制循环切片总表 | `SCHOOL_CYCLE_LORE_SLICES` 已调整：`seven_anchor_loop`、`school_leak_apartment_shell` 最低档改为 **deep**；新增 fracture 切片 `not_ordinary_wanderer_coupling` |
| `major_npc_relink_v1`（既有） | 重连阶段系统裁决 | 不变；`major_npc_arc` / `team_relink` 消费其 `entries` |

紧凑形态（`minimal` / 预算截断）：`worldLorePacketsCompact` 内含 `major_npc_arc_packet`（缩写键）、`cycle_loop_packet`（`band`+`h`）、`school_source_packet`（`inj`+`L`）、`team_relink_packet`（`x`/`cr`/`t`）。

## World knowledge bootstrap 变更

- 新文件：`src/lib/registry/worldArcBootstrapSlices.ts`  
  - 实体前缀：`truth:world_arc:{id}`  
  - `sourceRef`：`registry/worldArcBootstrapSlices.ts`  
  - `tags`：含 `world_arc`、`school_cycle`、`major_npc`、`yeliri`、对应 `reveal_fracture` / `reveal_deep` 等  
- `registryAdapters.ts`：遍历 `WORLD_ARC_BOOTSTRAP_SLICES` 写入实体与 chunk。  
- `coreCanonMapping.ts`：`buildWorldArcBootstrapFactsForCanon()` 写入 `LoreFact`（`factKey` 前缀 `world_arc_bootstrap:`）。

专条主题：高魅力 NPC 职能壳边界（fracture）、七锚循环、校源徘徊者定义、欣蓝情绪记忆锚、龙月与十日闪烁、学校泄露与公寓收容双端因果。

## 相关源码索引

- `src/lib/registry/schoolCycleCanon.ts` — 切片与 `school_cycle_arc_*` packet  
- `src/lib/registry/worldSchoolRuntimePackets.ts` — `major_npc_arc` / `cycle_loop` / `school_source` / `team_relink`  
- `src/lib/registry/worldArcBootstrapSlices.ts` — bootstrap 专条  
- `src/lib/registry/revealRegistry.ts` — `REVEAL_TIER_METAS` + `REVEAL_GATE_RULES`  
- `src/lib/registry/majorNpcDeepCanon.ts` — `buildMajorNpcKeyHintsForPacket` surface 裁剪  
- `src/lib/playRealtime/runtimeContextPackets.ts` — 注入与 compact  
- `src/lib/playRealtime/stage2Packets.ts` — `b1Meaning` 分档（七锚用语仅 deep+）

## Packet 示例 JSON（节选）

### `major_npc_arc_packet`（deep，邻近欣蓝）

```json
{
  "schema": "major_npc_arc_v1",
  "maxRevealRankInjected": 2,
  "nearby": [
    {
      "id": "N-010",
      "displayName": "欣蓝",
      "surfaceIdentity": "物业口路线预告 / 转职登记（公寓职能掩护）",
      "dutyEchoHint": "把上楼路径与风险包装成「可签字的未来」，让失控分支在表格层被推迟。",
      "schoolResidueHint": "耶里学生会档案干事：旧七人里负责记名单、记承诺、记谁欠谁一次的人。",
      "residualEchoHint": "她会在主锚身上闻到「旧阵缺一角」的焦虑——像名单末行被撕掉，而主锚是那道撕口。",
      "relinkSignals": {
        "phase": 2,
        "deepEchoLicensed": true,
        "loopPartiallyActive": false,
        "dejaToneOk": true
      }
    }
  ],
  "antiDumpPolicy": "即使玩家追问，亦须分步交付；本包为预算上限，非一次性必答清单。"
}
```

### `cycle_loop_packet`（fracture）

```json
{
  "schema": "cycle_loop_v1",
  "maxRevealRankInjected": 1,
  "visibleBand": "rhythm",
  "hints": [
    "住户闲聊里偶尔提到邻校「耶里」：那边曾出过「整栋楼像被拧进另一层空间」的怪谈；如月公寓则被说成「折进时间褶皱里的另一栋」。真相未证，仅作传言。",
    "数名与关键服务节点强绑定的住户，其反应节律更像被楼「认可」的长期职能节点，而非临时登记人口或普通污染残留。可描写违和与既视感，但不要在此档点名「辅锚」「校籍」或七人闭环。",
    "第 3 日 0 时起环境节律可能收紧（可感知后果，根因此档不直述）。"
  ],
  "antiDumpPolicy": "即使玩家追问，亦须分步交付；本包为预算上限，非一次性必答清单。"
}
```

### `school_source_packet`（deep）

```json
{
  "schema": "school_source_v1",
  "injected": true,
  "maxRevealRankInjected": 2,
  "lines": [
    "邻校传言：住户闲聊里偶尔提到邻校「耶里」…",
    "非普通徘徊者耦合：数名与关键服务节点强绑定的住户…",
    "泄露与收容壳层：耶里学校是【空间】权柄碎片初次大规模异动的缘起侧之一…",
    "校源徘徊者：六名共鸣辅锚原为耶里学校学生…",
    "七锚分担：泡层内嵌固定七锚结构…"
  ],
  "antiDumpPolicy": "即使玩家追问，亦须分步交付；本包为预算上限，非一次性必答清单。"
}
```

### `team_relink_packet`（邻近两人）

```json
{
  "schema": "team_relink_v1",
  "xinlanPivotOpen": true,
  "crisisJoinWindowActive": false,
  "xinlanRelinkPhase": 3,
  "nearbyTextures": [
    {
      "id": "N-010",
      "displayName": "欣蓝",
      "relinkPhase": 3,
      "oldLoopPartial": true,
      "dutyEchoOn": true,
      "textureLine": "欣蓝：阶段3（旧阵第一牵引入位）；残响叙事已许可；旧阵槽位已激活（非全程跟队）"
    }
  ],
  "note": "供叙事质感与关系压强；不等于全员跟队或 UI 队友状态。",
  "antiDumpPolicy": "即使玩家追问，亦须分步交付；本包为预算上限，非一次性必答清单。"
}
```

## 防剧透策略（实现向）

1. **门闸单一来源**：`computeMaxRevealRankFromSignals`；packet 只读注入档，模型不应自抬档。  
2. **切片最低档**：`schoolCycleCanon` / `worldArcBootstrapSlices` 的 `revealMinRank` 与 `reveal_*` tag 一致。  
3. **bridge_hints 裁剪**：surface 不输出 `wandererSubtype` / `teamBridgeRole`。  
4. **叙事预算句**：各包含 `antiDumpPolicy`；检索 chunk 仍可能被 RAG 命中，故检索层需按 tag/档位过滤（沿用项目既有检索策略）。  
