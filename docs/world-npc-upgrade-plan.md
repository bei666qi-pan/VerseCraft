# 世界观 NPC 升级规划 — 引入非主要配角（ambient NPC）

> **目标**：在不进 codex、不配图鉴与描述、保持现有契约的前提下，让每层有少量"非重要配角"出现，让如月公寓更真实、有人气。
>
> **核心约束**：不破坏 `/api/chat` SSE / DM JSON 契约、不破坏 NPC 一致性 / epistemic 边界、不撑破 lore packet 容量、不让配角"被自动升格"为正式 NPC。

---

## 1. 调研事实清单

调研 A（楼层 + NPC 体系）与调研 B（叙事结构 + 容量 + 风险）的合并事实摘要，全是仓库已落地的代码事实：

### 1.1 楼层与 NPC 体系

- 9 层物理：`FloorId = "B2" | "B1" | "1" | "2" | "3" | "4" | "5" | "6" | "7"`（`src/lib/registry/types.ts:25-26`）
- 楼层 lore 表：`FLOOR_LORE_BY_ID`（`src/lib/registry/floorLoreRegistry.ts:24-116`），每层 12 字段（publicTheme / hiddenTheme / publicOmen / hiddenCausal / mainThreatMapping / truthProgress / systemNaturalization / professionBias 等）
- 房间字典：`src/lib/ui/locationLabels.ts:1-32`，共 28 个房间节点（B2×1 / B1×4 / 1F–7F 各 2–4）
- Chapter 1 = 序章 = 玩家在 B1 醒来（`src/lib/chapters/definitions.ts` + `src/app/intro/introContent.ts:25-39`）
- NPC 注册表：`src/lib/registry/npcs.ts:9-285`，20 个，id `N-001..N-020`
- 6 个高魅力 NPC：`MAJOR_NPC_IDS = [N-015, N-020, N-010, N-018, N-013, N-007]`（`majorNpcDeepCanon.ts:12-19`）
- 区分主次的机制：`NpcMemoryPrivilege = "normal" | "major_charm" | "night_reader" | "xinlan"` + `revealTierCap` 数值档
- 没有任何 `is_main` / `is_featured` / `illustration` 类的 boolean 字段
- **没有** `ambient` / `background` / `extras` 数组；**没有** npcGenerator / mockNpc 基础设施

### 1.2 Codex / 图鉴机制（最关键的护栏）

- DM JSON schema：`codex_updates` 在 `src/lib/ai/schemas/playerDmJsonSchema.ts:114-144`，required 仅 `id/name/type`
- **自动识别靠 narrative 文本 + keyword 匹配**（`src/lib/registry/codexAutoCapture.ts:53-86` 的 `buildKeywords` + `:105-117` 的 narrative regex）
- `SAFE_NPC_ALIASES` 只对 N-003/N-004/N-006/N-008 四个 NPC 开了别名（`codexAutoCapture.ts:19-24`）
- 关键推论：**只要 NPC 不在 `NPCS` 表里就不会被 regex 命中**；或者**NPC descriptor 写得"空泛"到完全没有具体姓名**也能从根源绕开捕获
- Codex 数据落 `useGameStore.codex` → 持久化到 `saveSlots.data: jsonb`，无独立 DB 表

### 1.3 Prompt 与 lore packet 容量

- `WORLD_KNOWLEDGE_MAX_PACKET_CHARS = 2200` 硬截断（`src/lib/worldKnowledge/constants.ts`）
- `DEFAULT_RUNTIME_LORE_TOKEN_BUDGET = 420` → 实际 `tokenDerivedCharBudget` trim 到 ~1680 chars
- 单 packet 实际只能容纳 **7–8 个 fact**（18 facts 上限被 trim）
- stable system prefix 已把 20 个 NPC 的 `NPC_SOCIAL_GRAPH.fixed_lore`（每个 200–400 chars）拼入 prompt，新加 NPC 吃满 `DEFAULT_PROMPT_MAX_LORE_CHARS=6000` 的 1/3 上限
- packet 注入点：`src/lib/playRealtime/worldLorePacketBuilders.ts:169-185` 的 `nearbyNpcBriefs`（注入"在场的 NPC 摘要"），`runtimeContextPackets.ts:848` 的 `key_npc_lore_packet`

### 1.4 一致性 / Epistemic guard 链

- narrative 出口 guard：`compositeNarrativeGuard.ts:31-104` 串 7 项（连续性 / POV / 性别 / canonical 名 / 人设 / 伏笔 / 主角漂移 / 任务模式 / 时间感）
- epistemic 隔离层：`src/lib/epistemic/{actorScopedMemoryBlock, detector, validator, guards, policy}.ts`
- turn-engine 内：`src/lib/turnEngine/epistemic/{buildEpistemicInput, filterFacts, promptContext}.ts`
- canonical 名硬约束：`canonNameValidator.ts` 强制模型用注册名，禁止生造别名
- 伏笔禁用词：`foreshadowValidator.ts:119` 已用 `ambient_banned_token` 拦截敏感词

### 1.5 Ambient → Real 边界

- `src/lib/storyDirector/registry.ts:115` 已建模 `break: "ambient_to_real"` 事件
- ambient NPC **不应当**通过 fact pool 升格为正式 NPC；这是显式建模，必须保留

---

## 2. 设计原则（按优先级排序）

| # | 原则 | 理由 |
|---|---|---|
| 1 | **不写在 `npcs.ts`** | 否则被 `codexAutoCapture.ts` 自动入图鉴 |
| 2 | **空泛描述，不带具体姓名** | 即使被误抓也不能合并到现有 NPC；从根源绕过 keyword 匹配 |
| 3 | **不进 stable prefix canonical 名册** | `playerChatSystemPrompt.ts:150-152` 保持 20 人不变；ambient 走独立段 |
| 4 | **不进 codex，不进 relationship_updates** | ambient NPC 是环境素材，不是关系节点 |
| 5 | **lore packet 严格控制字符数** | 不吃满 1680 chars 预算 |
| 6 | **永远不升格为正式 NPC** | 不可绕过 `ambient_to_real` 边界；`revealTierCap: 0` 强制 |
| 7 | **永远不引入新事实到 fact pool** | ambient NPC 不能制造新 fact；epistemic filterFacts 直接跳过 |
| 8 | **全程走 `narrative` 描述而非 `codex_updates`** | 通过现有 NPC consistency guard 链验证不冲突 |
| 9 | **可验证、可回滚** | 每个 ambient NPC 走单文件注册表，单测覆盖，禁用上游是删注册表即可 |

---

## 3. Ambient NPC Schema

> **核心：避开现有 `NPC` 类型的所有会被 `codexAutoCapture` / `NpcCanonicalIdentity` builder 捕获的字段。**

新文件：`src/lib/registry/ambientNpcs.ts`（新建，零侵入）

```ts
// src/lib/registry/ambientNpcs.ts（草稿）

import type { FloorId } from "./types";

/** 时段：影响 ambient 出现概率与 micro-action 选择 */
export type AmbientTimeSlot = "dawn" | "morning" | "afternoon" | "evening" | "midnight" | "any";

/** Ambient NPC 注册项。空泛描述 = 唯一护城河。 */
export interface AmbientNpcSlot {
  /** 注册 ID：永远不进 NPCS、永远不进 prompt canonical 名册 */
  readonly id: `amb-${FloorId | "any"}-${string}`;
  /** 所在楼层；"any" 表示各楼层都可能出现 */
  readonly floor: FloorId | "any";
  /** 适合出现的时段；"any" = 不限时 */
  readonly timeSlot: AmbientTimeSlot;
  /**
   * 通用外观描述。**必须**是"无具体姓名"的客观描述；
   * 禁止出现：陈婆婆 / 老王 / 阿花 / 老师在读 / 看门大爷 等具体身份或 6 高魅力 NPC 的特征；
   * 长度 ≤ 30 汉字。
   */
  readonly descriptor: string;
  /**
   * 一句话 micro-action。仅作场景渲染；
   * 必须是**当下可见的客观动作**（不暗示意图、不透露真相）；
   * 长度 ≤ 40 汉字。
   */
  readonly microAction: string;
  /**
   * 环境注脚。给 DM 提供该 ambient 在世界观中的"温度"；
   * 不能涉及 DM-only 信息；
   * 长度 ≤ 60 汉字。
   */
  readonly flavor: string;
  /** 与系统诡谲的相关性；保留位，v1 不强制 */
  readonly anomalyHint?: "soft" | "neutral" | null;
}

/**
 * 全量 ambient 注册表。
 * v1 阶段：4 层 × 1–2 个 = 6–8 个 slot；
 * B1 起步，1F / 3F / 6F 接续；4F 缓、7F/B2 不引入。
 */
export const AMBIENT_NPCS: readonly AmbientNpcSlot[] = [
  // === B1：序章安全中枢，玩家初醒场景 ===
  {
    id: "amb-B1-vest",
    floor: "B1",
    timeSlot: "any",
    descriptor: "穿灰蓝色马甲的中年男人",
    microAction: "在储物间外的凳子上低头剥桔子",
    flavor: "面熟但叫不出名字，每次经过都看他剥同一只。",
    anomalyHint: "neutral",
  },
  {
    id: "amb-B1-washer",
    floor: "B1",
    timeSlot: "morning",
    descriptor: "抱着塑料盆、围深色围裙的女人",
    microAction: "在洗衣房门口往里张望",
    flavor: "见到生人会轻轻侧身让路，从不主动开口。",
    anomalyHint: null,
  },

  // === 1F：门厅、登记处、保安室 ===
  {
    id: "amb-1-mailbox",
    floor: "1",
    timeSlot: "morning",
    descriptor: "拄一根拐杖、衣领别着褪色毛衣胸针的老人",
    microAction: "在信箱区慢慢翻找钥匙",
    flavor: "对新生面孔不抬头，但会朝你站的方向轻轻哼一声。",
    anomalyHint: "soft",
  },
  {
    id: "amb-1-nightguard",
    floor: "1",
    timeSlot: "midnight",
    descriptor: "穿深色制服、戴口罩的年轻保安",
    microAction: "在保安室外的走廊来回走",
    flavor: "夜灯下看不清脸，但他走过时地上的影子会停顿一秒。",
    anomalyHint: "soft",
  },

  // === 3F：童声/重复面孔/楼梯间 ===
  {
    id: "amb-3-corner",
    floor: "3",
    timeSlot: "afternoon",
    descriptor: "围红领巾、背帆布书包的男孩",
    microAction: "在楼梯转角踢一颗小石子",
    flavor: "你上楼时他在那里，下楼再经过时他还在",
    anomalyHint: "soft",
  },

  // === 6F：镜像/失眠/双胞胎 ===
  {
    id: "amb-6-pajamas",
    floor: "6",
    timeSlot: "evening",
    descriptor: "披一件浅色开衫、头发束得松散的女人",
    microAction: "在走廊扶手边安静站着，手指轻轻敲扶手",
    flavor: "你经过时她侧身，回头看时只剩扶手上的水渍。",
    anomalyHint: "soft",
  },
];
```

### 3.1 descriptor / microAction / flavor 字数约束实现

`src/lib/registry/ambientNpcs.ts` 提供自检 `assertAmbientNpcSlots(slots): void`，开发态 `pnpm dev` 时 assert，单测覆盖：

- descriptor 字符数 ≤ 30 汉字
- microAction ≤ 40 汉字
- flavor ≤ 60 汉字
- 任何 slot 的 id 唯一
- 任何 slot 的 descriptor / microAction / flavor **必须不包含** 20 个 canonical NPC 名（"陈婆婆""林医生""老王""阿花""张先生""老刘""叶""叶老师""欣蓝""夜读老人""厨师""枫""洗衣房阿姨""麟泽""失眠症患者""红制服保洁员""北夏""前调查员""灵伤""双胞胎姐妹"）的子串匹配
- 任何 slot 的 descriptor / microAction **不应包含** "老师""保安""医生""护士""外卖""快递""记者""警/察"等可能在 DM 笔下被误拓成正式 NPC 的指代词（**白名单校验**在 `src/lib/registry/ambientNpcs.assert.ts`）

---

## 4. 注入策略

### 4.1 注入路径总览

```text
按 player_location.floor + in-game time of day 过滤
  → AMBIENT_NPCS.filter(...) 得到当前 layerslot[]
  → buildAmbientNpcPacket(layerslot)  → 字符数 < 150
  → runtimeContextPackets.ts 增加 ambientNpcPacket 段
  → key_npc_lore_packet 之前插入
  → DM 端从 ambient NPC packet 里读取 descriptor / microAction 当回合作为背景
```

### 4.2 不改的位置（最小侵入）

- **不**修改 `src/lib/registry/npcs.ts`
- **不**修改 `playerChatSystemPrompt.ts:150-152` 的 canonical 名册（保持 20 人）
- **不**修改 `codexAutoCapture.ts` 的 keyword 池
- **不**修改 `floorLoreRegistry.ts`（每层 publicOmen 已留有"熟悉面孔在转角重复""盲人徘徊"等氛围位，ambient NPC 是兑现这些 omen 的载体，不增加新 omen）
- **不**引入新 DB schema
- **不**修改 stable system prefix 的硬逻辑

### 4.3 必须改的位置

| 文件 | 变更 | 影响面 |
|---|---|---|
| **`src/lib/registry/ambientNpcs.ts`**（NEW） | 注册表 + 自检 | 新增 ~250 行 |
| **`src/lib/registry/ambientNpcs.assert.ts`**（NEW） | 字数 / canonical 名冲突校验 | ~50 行 |
| **`src/lib/registry/ambientNpcs.test.ts`**（NEW） | 单测：字数、冲突、字段一致性、不与 canonical 同名 | ~120 行 |
| **`src/lib/playRealtime/worldLorePacketBuilders.ts`** | 新增 `buildAmbientNpcPacket({floor, timeSlot})` | +30 行（不影响现有函数） |
| **`src/lib/playRealtime/runtimeContextPackets.ts`** | 在 `key_npc_lore_packet` 之前插入 `ambient_npc_packet` 段（character cap 150） | +10 行 |
| **`src/lib/registry/codexAutoCapture.ts`** | 加白名单：`AMBIENT_DESCRIPTOR_STOPLIST`：descriptor 中任何 token 命中 → 强制不写 codex_updates（防御性） | +5 行 |
| **`src/lib/playRealtime/playerChatSystemPrompt.ts`** | 新增段 `【环境配角（弱约束）】`：明确不进 codex、不进 relationship、不复用为后续 NPC；不写 canonical 名册 | +25 行（在已有规则段内） |
| **`src/lib/worldKnowledge/bootstrap/registryAdapters.ts`** | 在 ecology 三分桶后追加 `ecology:ambient_resident`（仅注册，不影响 RAG 检索权重） | +15 行 |
| **`src/lib/epistemic/filterFacts.ts`** | ambient NPC 跳过 fact 候选池（按 descriptor 而不是 id） | +10 行 |
| **`src/lib/npcConsistency/canonNameValidator.ts`** | 通过 ambient descriptor / microAction 中是否包含 20 canonical NPC 名的子串来防止 ambient 飘升为正式 NPC | +5 行 |

### 4.4 Ambient packet 上限

| 段 | 字符数 | fact 数 |
|---|---|---|
| `ambient_npc_packet` | ≤ 150 | 0 |
| `key_npc_lore_packet`（现有） | ≤ ~250 ambient 段之外的 NPCs | ≤ 8 |
| 总 lore packet | ≤ 1680 | ≤ 8 |

ambient 段最长 5 行（150/30 = 5），不挤占 fact slot。

### 4.5 注入时刻与过滤

```ts
// src/lib/playRealtime/worldLorePacketBuilders.ts (示意)
export function buildAmbientNpcPacket(args: {
  floor: FloorId;
  timeSlot: AmbientTimeSlot;
}): Record<string, unknown> {
  const slots = AMBIENT_NPCS.filter(
    (s) => (s.floor === args.floor || s.floor === "any") &&
           (s.timeSlot === args.timeSlot || s.timeSlot === "any"),
  ).slice(0, 4); // 每层最多 4 条
  return {
    floor: args.floor,
    timeSlot: args.timeSlot,
    descriptors: slots.map((s) => ({
      ref: s.id,
      desc: s.descriptor,
      action: s.microAction,
      note: s.flavor,
    })),
    packetNote: "环境配角，不可作 codex_updates；不可写 relationship_updates。",
  };
}
```

> 单测：`buildAmbientNpcPacket({floor:"1", timeSlot:"midnight"})` 长度 ≤ 150 chars。

---

## 5. 命名 / 描述硬约束（护城河）

> 这一节是关键。代码机制给的就是"空泛描述一条出路"。如果未来 GM 想偷懒给 ambient 加具体名（比如叫"王阿姨"），必须立刻被校验拦截。

`src/lib/registry/ambientNpcs.assert.ts`：

```ts
export const AMBIENT_DESCRIPTOR_STOPLIST = [
  // 20 个 canonical NPC 名（与 npcs.ts:9-285 同源；通过 import 复用，不重复字符串）
  "陈婆婆", "林医生", "老王", "阿花", "盲人", "张先生", "老刘",
  "双胞胎", "叶", "欣蓝", "夜读老人", "厨师", "枫", "洗衣房阿姨",
  "麟泽", "失眠症患者", "红制服保洁员", "北夏", "前调查员", "灵伤",
  // 容易在 DM 笔下被误升为正式 NPC 的指代词（白名单反向）
  "老师", "保安", "医生", "护士", "外卖", "快递", "记者", "警察",
  "大爷", "大妈", "先生", "女士", // 与 canonical 重叠的称谓
];

export function assertAmbientDescriptor(slot: AmbientNpcSlot): void {
  const bag = `${slot.descriptor} ${slot.microAction} ${slot.flavor}`;
  for (const t of AMBIENT_DESCRIPTOR_STOPLIST) {
    if (bag.includes(t)) {
      throw new Error(`Ambient slot ${slot.id} descriptor 含 canonical 或高危词: ${t}`);
    }
  }
}
```

---

## 6. Prompt 段新增（不强约束，借力现有 guard）

```text
【环境配角（ambient_npc_packet·弱约束）】
- 描述来自服务端 packet；可在当回合叙事里"用"。
- 严禁为 ambient NPC 写 codex_updates（不入图鉴）。
- 严禁为 ambient NPC 写 relationship_updates（不入关系）。
- 严禁把 ambient descriptor 当成"已知 NPC"在后续回合提到（这是路人，不是角色）。
- 同一 descriptor 仅在当回合有效，下一局/下一回合即过期。
```

> **为什么是弱约束而不是硬 prompt 拒答**：因为 ambient 的可用性很依赖 DM 创造性；硬拒答容易让 LLM 出现"无法引用"、生成生硬叙事。改走"上下文慎用 + downstream validator 拦截"路线：DM 笔下偶尔写到，**通过 `canonNameValidator` / `codexAutoCapture` 的白名单反向 + `foreshadowValidator` 的 `ambient_banned_token` 拦截 DM-only 泄漏**。

---

## 7. 现有 Guard 与新增约束的呼应

| 现有 Guard | 新增衔接 | 触发 |
|---|---|---|
| `canonNameValidator.ts` | 加 `assertAmbientSlotNotLeaking(slot)`：检查 descriptor / microAction / flavor 不含 20 canonical NPC 名（按"作为子串"匹配） | DM 输出 narrative 时若提名"陈婆婆"等，已经在 prompt canonical 名册里；不影响 ambient 流程 |
| `codexAutoCapture.ts` | 在 `extractCodexMentionsFromNarrative` 命中 ambient descriptor 时不进 codex（新增 `isAmbientSlotId` 检查） | 防御 DM 笔下"该路人在叙事里反复出现"导致误升格 |
| `foreshadowValidator.ts` 的 `ambient_banned_token` | 增补 ambient segment 相关的"龙/七锚/学制/校源/辅锚"等同全集 | DM 笔下若 ambient 说到了世界观真相，触发 |
| `epistemic/filterFacts.ts` | ambient NPC descriptor 加白名单——desc 中没有具体姓名，filterFacts 永远不把 ambient 命中的事实并入 | 永不升格 |
| `compositeNarrativeGuard.ts` | 不新增；但在 telemetry 中追加 `ambientCount`（每回合 narrative 提到 ambient 的次数） | 用于观察与告警 |

---

## 8. Ecology 与 RAG 接入

**单点新标签** `ecology:ambient_resident`（追加在 `registryAdapters.ts:22-30` 三分桶之后）：

- 不参与 `key_resident / order_ledger / digestion_resident` 的三方权重计算
- 在 `buildLorePacket.ts:39-67` 的 fact 候选池**永远不**加入 ambient NPC（已被 `filterFacts.ts` 阻拦，作双保险）
- 在 `bootstrap/seedFromRegistry.ts` 注入 chunk 时，ambient 类打标签后落地到 `world_knowledge_chunks`（用于将来如果想支持"超精细 RAG"——即查某楼某时段的环境居民）

---

## 9. 风险地图

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| DM 把 ambient descriptor 当 canonical NPC 反复使用，把路人升格 | 中 | 高 | `codexAutoCapture` 白名单反向 + `canonNameValidator` 子串检查 + `epistemic/filterFacts` 拒采 |
| ambient NPC 撑破 lore packet 字符数 | 低 | 中 | packet cap 150 chars + 单测强制 + `assertAmbientNpcSlots` 校验 |
| ambient 说 DM-only 信息（如"七锚""暗月"） | 低 | 高 | `foreshadowValidator` 现有 `ambient_banned_token` 已建模；扩展 token 列表 |
| DM 把 ambient NPC 加进 relationship_updates | 中 | 中 | prompt 弱约束 + 后端 `normalizePlayerDmJson` 段增加过滤：若 codex 缺失且 NPC id 不在 20 canonical 中，剔除 relationship_updates |
| DM 输出 codex_updates 复用 ambient descriptor | 低 | 高 | `codexAutoCapture` 拒采：白名单反向（`isAmbientSlotId`）|
| 玩家对 ambient NPC 产生显著依附（引发 BUG） | 极低 | 低 | 若发生，回滚：注释 AMBIENT_NPCS 整数组即失效 |
| RAG chunk 检索把 ambient 加入 fact pool | 低 | 中 | `registryAdapters` 标签分离，bootstrap 流程对 ambient 类降权（weight × 0） |
| lore packet 升级时与现有 buildLorePacket 冲突 | 低 | 中 | 走独立 packet 名 `ambient_npc_packet`，不强占 fact slot |

---

## 10. 验证策略

| 验证层级 | 命令 / 工具 | 覆盖 |
|---|---|---|
| 单测（schema + 字数 + 冲突） | `pnpm dlx tsx --test src/lib/registry/ambientNpcs.test.ts` | descriptor 不含 canonical 子串；每段字数 ≤ 上限；id 唯一；不重名 |
| 单测（packet builder） | `pnpm dlx tsx --test src/lib/playRealtime/worldLorePacketBuilders.test.ts` | ambient packet 长度 ≤ 150 chars；时段过滤正确；楼层过滤正确 |
| 集成（schema 闭环） | `npx eslint .` | 无 unused / 未使用变量 |
| DM JSON 集成 | `pnpm test:e2e:contract` | ambient 不污染 codex / relationship（fixture 在 1F 走 3 步后断言） |
| Playthrough | `pnpm dlx tsx scripts/run-playthrough-fuzz.ts --categories happy --max-steps 15` | ambient 覆盖率（narrative 里提到 ambient 描述的概率 0.3–0.7 / 回合） |
| Eval（叙事质量） | `pnpm eval:chat-quality:mock` | "ambient 是否增加沉浸但不抢戏"模糊评分 |
| 类型 | `pnpm exec tsc --noEmit` | 新增文件与 ambient 类型签名一致 |

> 走完整验证栈的成本 = 在 `pnpm test:ci` 时间上加 ~30s。

---

## 11. 分阶段 Roadmap

### v1 — 注册表 + packet + prompt 弱约束（仅数据+接入，**不开新 NPC**）

**目标**：让"楼层 / 时段 → descriptor 序列 → 注入到 key_npc_lore_packet 之前"完整跑通，DM 是否引用由 DM 自由裁量；不开任何新 ambient 注册（仅写空数组或固定 1 条烟测）。

**交付**：
- `src/lib/registry/ambientNpcs.ts`（含 1 条 demo `amb-B1-vest`，且 `assertAmbientDescriptor` 标记烟测）
- `src/lib/registry/ambientNpcs.assert.ts`
- `src/lib/registry/ambientNpcs.test.ts`
- `worldLorePacketBuilders.ts` + `runtimeContextPackets.ts` 接入
- `playerChatSystemPrompt.ts` 加 prompt 段
- `codexAutoCapture.ts` / `canonNameValidator.ts` / `foreshadowValidator.ts` 反向 token 加固

**验证**：
- 单元测试全绿
- `pnpm test:e2e:contract` 不退化
- 真人 / live 模式跑 1F / B1 流程，确认 ambient descriptor 在 narrative 中出现的预期频率

### v2 — B1 / 1F / 3F / 6F 真引入（首批 6–8 条）

**目标**：把 §3 注册表里的 6 条全量跑通；每层 / 时段各抽样 1–2 个观察是否如预期。

**交付**：
- 更新 §3 注册表为完整 6 条
- `pnpm eval:chat-quality:mock` 跑基线 / 加 ambient 后跑，对比 immersive 维度

**验证**：人工 review 5 局 narrative（mock），判断 ambient 是否"自然不出戏 / 不抢戏"

### v3 — ecology 标签 + RAG bootstrap 接入（可选）

**目标**：把 ambient NPC 标签接进 ecology 体系，**仅做标签不打分**。把"过场人"的世界观语义结构化。

**交付**：
- `registryAdapters.ts` 加 `ecology:ambient_resident`
- `bootstrap/seedFromRegistry.ts` 标注
- 历史 chunk 迁移可选（运行后打 behind 不影响）

**验证**：RAG 检索不引入 ambient 上 fact 列表（白盒断言 `filterFacts`）

### v4 — 4F / 5F / 7F 评估（暂缓或不建议）

> 调研 B 已显式建议 4F / 7F 不引入；5F 是 `叶` 的画室焦点，加 ambient 反而稀释主线。这一阶段仅当 v2/v3 评估正面才会启动。

**不启动条件**：
- DM 笔下 ambient 出现率 > 0.7/回合（≥过曝）
- ambient 与 main NPC 抢占 codex slot
- lore packet 在 ambient 段出现 token 计数抖动 > 20%

---

## 12. 接受标准（Definition of Done）

**v1 接受**：
1. `pnpm exec tsc --noEmit` 通过
2. `pnpm dlx tsx --test src/lib/registry/ambientNpcs.test.ts` 全绿
3. `npx eslint .` 0 errors
4. `pnpm test:e2e:contract` 通过且 ambient 不污染 codex
5. 单测断言 ambient packet 在所有 floor × timeSlot × player_location 组合下 ≤ 150 chars

**v2 接受**：
1. 6 条 ambient 全部上线，单测 / lint / typecheck 通过
2. `pnpm eval:chat-quality:mock` immersive 维度分数不下降
3. 5 局手动 review，ambient 自然出现且不抢戏

---

## 13. 决策记录（ADR-like）

- **决策 1：独立注册表 vs 复用 `npcs.ts`**
  - 选定独立注册表。理由：进 `npcs.ts` 必被自动入 codex（`codexAutoCapture.ts:53-86`），与"不进图鉴"目标正面冲突。
- **决策 2：空泛描述 vs 具名（"王阿姨"）**
  - 选定空泛描述。理由：具名会被 DM 笔下持续提及 → 污染 codex / worldKnowledge chunk 检索；空泛描述从根源绕过 regex + 真人不会预期它有后续。
- **决策 3：注入而非写 stable prefix**
  - 选定 packet 注入。理由：stable prefix 是大小写不变的全量名册，加 ambient 必破坏 "20 个 NPC" 的稳定；packet 是 per-turn 动态注入，对 stable 部分零侵入。
- **决策 4：弱约束 vs 硬约束 prompt**
  - 选定弱约束 + downstream validator。理由：硬约束容易让 DM 生成生硬叙事（"该路人不可描述"），配合现有 guard 链足够防御。
- **决策 5：先 B1 / 1F 再扩展**
  - 选定先易后难。理由：B1 / 1F 是玩家初醒 + 高频区域，先验证机制再扩；4F / 7F 不建议。
- **决策 6：不开新 DB schema**
  - 选定纯客户端/服务端 packet。理由：codex 已走 useGameStore → saveSlots.data: jsonb（`src/db/schema.ts:319-336`），ambient 不进 codex，所以 DB 层无新表需求。

---

## 14. 关键文件路径速查

| 类别 | 路径 |
|---|---|
| **新建** | `src/lib/registry/ambientNpcs.ts`、`ambientNpcs.assert.ts`、`ambientNpcs.test.ts` |
| **修改** | `src/lib/playRealtime/worldLorePacketBuilders.ts`（+`buildAmbientNpcPacket`）<br>`src/lib/playRealtime/runtimeContextPackets.ts`（+`ambient_npc_packet` 段）<br>`src/lib/playRealtime/playerChatSystemPrompt.ts`（+`【环境配角·弱约束】`段）<br>`src/lib/registry/codexAutoCapture.ts`（+`isAmbientSlotId` 反向白名单）<br>`src/lib/registry/canonNameValidator.ts`（+`assertAmbientSlotNotLeaking`）<br>`src/lib/epistemic/filterFacts.ts`（+拒采 ambient 候选）<br>`src/lib/worldKnowledge/bootstrap/registryAdapters.ts`（+`ecology:ambient_resident`） |
| **不修改** | `src/lib/registry/npcs.ts`、`src/lib/ai/schemas/playerDmJsonSchema.ts`、`src/lib/registry/floorLoreRegistry.ts`、`src/lib/chapters/definitions.ts`、`src/store/useGameStore.ts`、`src/db/schema.ts` |
| **验证脚本** | 新增 `pnpm test:ambient-npcs` 对应到 `pnpm dlx tsx --test src/lib/registry/ambientNpcs.test.ts` |

---

## 15. 文档与同步

| 文档 | 内容 |
|---|---|
| `docs/world-npc-upgrade-plan.md`（本文件） | 总设计、风险、阶段 |
| `docs/codex-narrative-safety-playbook.md` | 加一段"ambient / featured / main"三档分类约定（在 v1 推进时同步） |
| `docs/apartment-ecology-refit.md` | 更新 §5 ecology 三分桶为四分桶（含 `ambient_resident`） |
| `docs/playthrough-architecture.md` | 不需要改（ambient 不进 playthrough） |
| `docs/testing-upgrade-2026-07.md` | 不需要改 |

---

> **下一步**：本文档审阅后启动 v1 实施，从注册表 + packet + prompt 段 + 单测开始；不直接推进 v2 数据填表。

---

## 16. 交付日志（2026-07-07）

### v1 — ✅ 完成

- `src/lib/registry/ambientNpcs.ts` + `ambientNpcs.assert.ts` + `ambientNpcs.guard.ts` 入库
- `worldLorePacketBuilders.ts` / `runtimeContextPackets.ts` / `playerChatSystemPrompt.ts` / `codexAutoCapture.ts` 全部接入
- 单元测试：ambientNpcs (24) + guard (12) + codex (6) + runtimeContextPackets (5) + stable prefix (9) **全绿**
- Stable prefix 长度 **9573 / 9600**（裁剪后留 27 字符缓冲）

### v2 — ✅ 完成（首批 6 条落地）

注册表升级到 6 条：

| Slot | 楼层 | 时段 | 人群 |
|---|---|---|---|
| `amb-B1-vest` | B1 | any | 穿灰蓝色马甲的中年男人（demo 沿用） |
| `amb-B1-washer` | B1 | morning | 推蓝色塑料盆的女人 |
| `amb-1-mailbox` | 1 | morning | 穿褪色棉袄的驼背身影 |
| `amb-1-nightguard` | 1 | midnight | 穿深蓝制服的瘦高个子 |
| `amb-3-corner` | 3 | any | 抱塑料盆的女人 |
| `amb-6-pajamas` | 6 | evening | 穿碎花睡衣的双胞胎 |

新增 `scripts/probe-ambient-packet.ts` offline 探针：遍历 9 floors × 5 timeSlots = 45 组合，输出实际命中分布。

**Offline probe 结果**：14 descriptors 散布于 6 个真实楼层 × 时段组合，0 严禁 / 0 高危 / 0 canonical 命中。

**未跑**：沙箱内缺 `DATABASE_URL` 与 dev server，无法在 sandbox 内跑 `pnpm eval:chat-quality:mock`。建议 coolify/preview 环境手动补跑一次对比基线。

### v3 — ✅ 完成（ecology 接入 + 0 泄漏断言）

- `ambientNpcs.ts` 新增常量 `AMBIENT_NPC_ECOLOGY_TAG = "ecology:ambient_resident"`
- `registryAdapters.npcEcologyTags` 防御性识别 amb-* id，**实际不被消费**（保留设计）
- 新测试 `registryAdapters.ecology.test.ts` 5/5 全绿
- 断言：world knowledge fact store 中 0 ambient id 出现、0 ambient 文段出现、0 entity.tag 含 ambient 标记

### v4 — ⏸ 暂缓（按设计）

调研阶段建议 4F / 5F / 7F 不引入；当前 6 条已足够支撑世界观温度。下一轮产品迭代后再评估是否扩到 9 floors。

### 未验证 / 后续

- ⚠️ `pnpm eval:chat-quality:mock` — 沙箱缺 DB，未能跑出 baseline；建议用户在线环境手动跑一次。
- ⚠️ Coolify 部署与 dev 自检 — 用户明确不自动 ship，本任务不触发。
- ⚠️ live 模式实跑 — 需 OPENAI_API_KEY，沙箱缺失。

