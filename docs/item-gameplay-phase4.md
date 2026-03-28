# 阶段 4：物品与目标可玩性增强（叙事主导）

本文档与实现同步：核心闭环在 `src/lib/play/itemGameplay.ts`，接入 `getPromptContext`、背包「消耗灵感」、`/api/chat` 选项注入与系统提示。

---

## 1. 物品玩法矩阵（类型 × 可触发行为 × 系统影响）

| 物品层 (`ItemDomainLayer` / 推断) | 可触发行为（叙事/选项） | 系统影响（结构化回写） |
| --- | --- | --- |
| **evidence**（情报/真相标签） | 质问 NPC、印证/反驳、解锁对话支、替代「空口调查」 | `clue_updates`、`task_updates`（分支/失败）、`relationship_updates` |
| **key**（钥匙/通行） | 打开区域、替代硬闯、隐蔽切入 | `player_location`、`consumes_time`、`consumed_items`（若一次性） |
| **tool**（诱饵/束缚/净化等） | 处理危险、争取窗口、观察痕迹 | `main_threat_updates`、`sanity_damage`、`consumed_items` |
| **consumable** | 「现在用 / 留后面」权衡 | `consumed_items`、属性类由叙事+后续 DM 字段体现 |
| **social_token**（伪装/豁免/旧好感等） | 贿赂、安抚、换情报、抬信任、委托前置 | `relationship_updates`、`codex_updates`、`task_updates` |
| **material**（默认/仓库向） | 交付、交换、锻造材料 | `awarded_*` / `consumed_items`、`dm_change_set` 折叠 |

推断规则见 `inferItemDomainLayer`；注册表可显式写 `domainLayer` 覆盖。

---

## 2. 目标推进矩阵（类型 × 推进方式 × 反馈）

| 目标类（`goalKind` / 叙事角色） | 推进方式 | 反馈 |
| --- | --- | --- |
| **Main** | 场景移动、威胁处置、关键道具 | `task_updates`、`main_threat_updates`、手记 `clue_updates` |
| **Promise** | NPC 交互、信任阈值、证据出示 | `relationship_updates`、`task_updates` |
| **Commission** | 交付物、时限、地点 | `consumed_items` / `awarded_items`、`task_updates` |
| **线索型（非正式）** | 调查、对照证物 | `clue_updates`、可经 `dm_change_set` 升为正式目标 |

---

## 3. 五个玩法闭环示例（可回接现有链）

1. **证据闭环**：玩家持 `I-B08`（intel）且同场有 NPC → 选项出现「【证】…」→ 玩家选择后 DM 在 `clue_updates` 写入「供述矛盾已记录」，并 `task_updates` 推进委托子阶段。  
2. **门禁闭环**：玩家持 `I-A03`（key）→ 选项「【门】…」→ 叙事开门 + `player_location` 更新；若设定一次性，`consumed_items` 含 `I-A03`。  
3. **消耗权衡闭环**：行囊有 `I-D01`、理智 &lt; 40 → 注入「【衡】…」→ 玩家选用则 `consumed_items` + 叙事代价（中毒风险等）。  
4. **社交闭环**：玩家持带 `tempFavor`/`amnesty`/`disguise` 类道具 →「【社】…」→ `relationship_updates` + 可能 `task_updates`（委托可交付）。  
5. **工具闭环**：诱饵/束缚类（`bait`/`binding`）→「【具】…」→ `main_threat_updates` 或 `sanity_damage` 与叙事一致。

失败/过期/被替代：由 DM 在叙事中声明，并落 `task_updates`（failed）、`clue_updates`（证伪）或不再注入相关选项（物品已 `consumed_items`）。

---

## 4. 代码落点清单

| 落点 | 职责 |
| --- | --- |
| `src/lib/play/itemGameplay.ts` | 层推断、DM 锚点文案、使用意图、`applyItemGameplayOptionInjection` |
| `src/lib/registry/itemLookup.ts` | `findRegisteredItemById`（与 `itemUtils` 分离，避免客户端误打包全表） |
| `src/store/useGameStore.ts` → `getPromptContext` | 追加【物品玩法锚点】 |
| `src/app/play/page.tsx` → `onUseItem` | `buildItemUseStructuredIntent` |
| `src/components/UnifiedMenuModal.tsx` | `getItemGameplayUiHints` 展示 |
| `src/app/api/chat/route.ts` | 收口后选项注入；输出审核后再注入一次 |
| `src/lib/playRealtime/playerChatSystemPrompt.ts` | DM 规则：物品必须有结构化后果 |
| `src/lib/play/itemGameplay.test.ts` | 单元测试 |

---

## 5. 后续可增强（未在本轮实现）

- 与 `dm_change_set.item_state_changes` / `world_risks` 的显式联动表。  
- 按 `journalClueIds` / `relatedItemIds` 过滤注入选项，减少无关项。  
- 任务元数据 `requiredItemId` 与选项文案逐任务定制。
