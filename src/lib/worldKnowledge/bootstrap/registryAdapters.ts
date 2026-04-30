import { ANOMALIES } from "@/lib/registry/anomalies";
import { APARTMENT_REVEAL_CANON, APARTMENT_SYSTEM_CANON } from "@/lib/registry/apartmentTruth";
import { ITEMS } from "@/lib/registry/items";
import { NPCS } from "@/lib/registry/npcs";
import { APARTMENT_SURVIVAL_NOTES } from "@/lib/registry/rules";
import { WAREHOUSE_ITEMS } from "@/lib/registry/warehouseItems";
import { FLOORS, MAP_ROOMS, NPC_SOCIAL_GRAPH } from "@/lib/registry/world";
import { FLOOR_DIGESTION_AXES, REVEAL_TIERS } from "@/lib/registry/worldCanon";
import { REVEAL_TIER_RANK, revealKnowledgeTagFromRank } from "@/lib/registry/revealTierRank";
import { SCHOOL_CYCLE_LORE_SLICES } from "@/lib/registry/schoolCycleCanon";
import { buildCycleMoonFlashFactsForCanon } from "@/lib/registry/cycleMoonFlashRegistry";
import {
  SCHOOL_CYCLE_RETRIEVAL_SEEDS,
  schoolCycleRetrievalRevealTag,
} from "@/lib/registry/schoolCycleRetrievalSeeds";
import { buildPlayerExperienceSchoolCycleFactsForCanon } from "@/lib/registry/playerExperienceSchoolCycleRegistry";
import { WORLD_ARC_BOOTSTRAP_SLICES } from "@/lib/registry/worldArcBootstrapSlices";
import { MAJOR_NPC_IDS, type MajorNpcId } from "@/lib/registry/majorNpcDeepCanon";
import { MAJOR_NPC_BRANCH_SEEDS } from "@/lib/registry/majorNpcBranchSeeds";

/** 公寓生态分层标签：检索时区分消化住户 / 校源耦合辅锚 / 秩序节点 */
function npcEcologyTags(npcId: string): string[] {
  if (MAJOR_NPC_IDS.includes(npcId as MajorNpcId)) {
    return ["ecology:key_resident", "apartment_coexists_digestion"];
  }
  if (npcId === "N-011") {
    return ["ecology:order_ledger", "ecology:digestion_manager"];
  }
  return ["ecology:digestion_resident", "apartment_coexists_digestion"];
}

export type WorldScope = "global" | "user" | "session";
export type WorldEntityType = "npc" | "anomaly" | "item" | "rule" | "truth" | "location";

export interface SeedEntityDraft {
  entityType: WorldEntityType;
  code: string;
  canonicalName: string;
  title: string;
  summary: string;
  detail: string;
  scope: WorldScope;
  ownerUserId: string | null;
  status: "active";
  sourceType: "bootstrap";
  sourceRef: string;
  importance: number;
  version: number;
  tags: string[];
}

export interface SeedEdgeDraft {
  fromEntityCode: string;
  toEntityCode: string;
  relationType: string;
  relationLabel: string;
  strength: number;
}

export interface SeedChunkDraft {
  entityCode: string;
  chunkIndex: number;
  content: string;
  tokenEstimate: number;
  importance: number;
  visibilityScope: WorldScope;
  ownerUserId: string | null;
  retrievalKey: string;
}

export interface RegistrySeedDraft {
  entities: SeedEntityDraft[];
  edges: SeedEdgeDraft[];
  chunks: SeedChunkDraft[];
}

function splitChunksByMaxLen(parts: string[], maxChars: number): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const p of parts.map((x) => x.trim()).filter(Boolean)) {
    const next = current ? `${current}\n${p}` : p;
    if (next.length > maxChars && current) {
      chunks.push(current);
      current = p;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function estTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function uniqueTags(tags: string[]): string[] {
  return [...new Set(tags.map((x) => x.trim()).filter(Boolean))];
}

function entityCodeByActorId(id: string): string {
  if (id.startsWith("N-")) return `npc:${id}`;
  if (id.startsWith("A-")) return `anomaly:${id}`;
  return `npc:${id}`;
}

function addChunksForEntity(
  entityCode: string,
  blockList: string[],
  importance: number,
  out: SeedChunkDraft[]
): void {
  blockList.forEach((content, idx) => {
    const normalized = content.trim();
    if (!normalized) return;
    out.push({
      entityCode,
      chunkIndex: idx,
      content: normalized,
      tokenEstimate: estTokens(normalized),
      importance,
      visibilityScope: "global",
      ownerUserId: null,
      retrievalKey: `${entityCode}:chunk:${idx}`,
    });
  });
}

export function buildRegistryWorldKnowledgeDraft(): RegistrySeedDraft {
  const entities: SeedEntityDraft[] = [];
  const edges: SeedEdgeDraft[] = [];
  const chunks: SeedChunkDraft[] = [];

  entities.push({
    entityType: "truth",
    code: "truth:apartment",
    canonicalName: "apartment_surface_truth",
    title: "如月公寓表层档案",
    summary: "月初误入、B1 暂安、守则真假参半与 B2 传闻。",
    detail: APARTMENT_REVEAL_CANON.surface.text,
    scope: "global",
    ownerUserId: null,
    status: "active",
    sourceType: "bootstrap",
    sourceRef: "registry/apartmentTruth.ts:APARTMENT_REVEAL_CANON.surface",
    importance: 100,
    version: 1,
    tags: ["core", "truth", "apartment", "world_mechanism", "reveal_surface"],
  });
  addChunksForEntity("truth:apartment", splitChunksByMaxLen(APARTMENT_REVEAL_CANON.surface.text.split("\n\n"), 1000), 100, chunks);

  for (const tier of [APARTMENT_REVEAL_CANON.fracture, APARTMENT_REVEAL_CANON.deep, APARTMENT_REVEAL_CANON.abyss]) {
    const revealTag = revealKnowledgeTagFromRank(tier.rank);
    const code = `truth:apartment_${revealTag.replace("reveal_", "")}`;
    entities.push({
      entityType: "truth",
      code,
      canonicalName: code.replace("truth:", ""),
      title: `如月公寓${tier.title}`,
      summary: tier.title,
      detail: tier.text,
      scope: "global",
      ownerUserId: null,
      status: "active",
      sourceType: "bootstrap",
      sourceRef: "registry/apartmentTruth.ts:APARTMENT_REVEAL_CANON",
      importance: tier.rank >= REVEAL_TIER_RANK.deep ? 99 : 96,
      version: 1,
      tags: ["core", "truth", "apartment", "world_mechanism", revealTag],
    });
    addChunksForEntity(code, splitChunksByMaxLen(tier.text.split("\n\n"), 1000), 96, chunks);
  }

  entities.push({
    entityType: "truth",
    code: "truth:apartment_system",
    canonicalName: "apartment_system_canon",
    title: "如月公寓系统因果档案",
    summary: "解释 B1、复活、原石、秩序与任务筛选为何成立。",
    detail: APARTMENT_SYSTEM_CANON.trim(),
    scope: "global",
    ownerUserId: null,
    status: "active",
    sourceType: "bootstrap",
    sourceRef: "registry/apartmentTruth.ts",
    importance: 98,
    version: 1,
    tags: ["core", "truth", "system_causality", "apartment", "reveal_fracture"],
  });
  addChunksForEntity(
    "truth:apartment_system",
    splitChunksByMaxLen(APARTMENT_SYSTEM_CANON.split("\n\n"), 1000),
    98,
    chunks
  );

  entities.push({
    entityType: "rule",
    code: "rule:apartment",
    canonicalName: "apartment_rules",
    title: "如月公寓生存笔记",
    summary: "入住须知残页、住户传言、物业残页与前人笔记；真假参半，需验证。",
    detail: APARTMENT_SURVIVAL_NOTES.map((note) => `${note.title}：${note.surfaceText}`).join("\n"),
    scope: "global",
    ownerUserId: null,
    status: "active",
    sourceType: "bootstrap",
    sourceRef: "registry/rules.ts:APARTMENT_SURVIVAL_NOTES",
    importance: 95,
    version: 1,
    tags: ["survival_note", "rumor", "remnant", "apartment", "reveal_surface"],
  });
  addChunksForEntity(
    "rule:apartment",
    APARTMENT_SURVIVAL_NOTES.map((note) =>
      [
        `${note.title}（${note.source}）`,
        `表层文本：${note.surfaceText}`,
        `可靠性：${note.reliability}`,
        `适用：${note.validWhen}`,
        `失效：${note.invalidWhen}`,
        `真实机制：${note.actualMechanism}`,
      ].join("\n")
    ),
    95,
    chunks
  );

  for (const floor of FLOORS) {
    const code = `location:floor:${floor.id}`;
    const roomNodes = MAP_ROOMS[floor.id] ?? [];
    entities.push({
      entityType: "location",
      code,
      canonicalName: `floor_${floor.id.toLowerCase()}`,
      title: `${floor.label}`,
      summary: floor.description,
      detail: `楼层：${floor.label}\n说明：${floor.description}\n节点：${roomNodes.join("，")}`,
      scope: "global",
      ownerUserId: null,
      status: "active",
      sourceType: "bootstrap",
      sourceRef: "registry/world.ts:FLOORS",
      importance: floor.id === "B2" ? 90 : 70,
      version: 1,
      tags: uniqueTags(["location", "floor", floor.id]),
    });
    addChunksForEntity(
      code,
      [`楼层 ${floor.label}\n${floor.description}\n可遍历房间：${roomNodes.join("，") || "无"}`],
      floor.id === "B2" ? 90 : 70,
      chunks
    );
    for (const room of roomNodes) {
      const roomCode = `location:room:${room}`;
      entities.push({
        entityType: "location",
        code: roomCode,
        canonicalName: room.toLowerCase(),
        title: room,
        summary: `${floor.label} 的房间节点`,
        detail: `节点：${room}（所属楼层：${floor.label}）`,
        scope: "global",
        ownerUserId: null,
        status: "active",
        sourceType: "bootstrap",
        sourceRef: "registry/world.ts:MAP_ROOMS",
        importance: floor.id === "B2" ? 85 : 65,
        version: 1,
        tags: uniqueTags(["location", "room", floor.id, room]),
      });
      addChunksForEntity(roomCode, [`房间节点：${room}\n所属楼层：${floor.label}`], floor.id === "B2" ? 85 : 65, chunks);
      edges.push({
        fromEntityCode: roomCode,
        toEntityCode: code,
        relationType: "located_in_floor",
        relationLabel: "room belongs to floor",
        strength: 80,
      });
    }
  }

  for (const [floorId, axis] of Object.entries(FLOOR_DIGESTION_AXES)) {
    const code = `location:floor_axis:${floorId}`;
    entities.push({
      entityType: "location",
      code,
      canonicalName: `floor_axis_${floorId}`,
      title: `${floorId}F 消化轴`,
      summary: `${axis.publicTheme} / ${axis.hiddenTheme}`,
      detail: [
        `公开主题：${axis.publicTheme}`,
        `隐秘主题：${axis.hiddenTheme}`,
        `消化阶段：${axis.digestionStage}`,
        `主威胁映射：${axis.mainThreatMapping}`,
        `真相进度：${axis.truthProgress}`,
        `系统自然化：${axis.systemNaturalization.join("；")}`,
      ].join("\n"),
      scope: "global",
      ownerUserId: null,
      status: "active",
      sourceType: "bootstrap",
      sourceRef: "registry/worldCanon.ts:FLOOR_DIGESTION_AXES",
      importance: 84,
      version: 1,
      tags: uniqueTags(["location", "floor_axis", floorId, "digestion", "threat", "reveal_fracture"]),
    });
    addChunksForEntity(
      code,
      [
        `楼层 ${floorId} 消化轴\n公开主题：${axis.publicTheme}\n隐秘主题：${axis.hiddenTheme}`,
        `主威胁映射：${axis.mainThreatMapping}\n阶段：${axis.digestionStage}\n真相进度：${axis.truthProgress}`,
      ],
      84,
      chunks
    );
  }

  for (const tier of REVEAL_TIERS) {
    const code = `truth:reveal_tier:${tier.id}`;
    entities.push({
      entityType: "truth",
      code,
      canonicalName: `reveal_tier_${tier.id}`,
      title: `揭露层级：${tier.title}`,
      summary: tier.revealPolicy,
      detail: `触发信号：${tier.unlockSignals.join("；")}\n披露策略：${tier.revealPolicy}`,
      scope: "global",
      ownerUserId: null,
      status: "active",
      sourceType: "bootstrap",
      sourceRef: "registry/worldCanon.ts:REVEAL_TIERS",
      importance: 72,
      version: 1,
      tags: uniqueTags(["reveal", "tier", tier.id, "reveal_surface"]),
    });
    addChunksForEntity(code, [`揭露层 ${tier.title}\n${tier.revealPolicy}`], 72, chunks);
  }

  // --- 学制 / 时间闭环 / 高魅力：truth 实体（与 coreCanonMapping 事实行一一对应）---
  for (const slice of SCHOOL_CYCLE_LORE_SLICES) {
    const code = `truth:school_cycle:${slice.id}`;
    const rTag = revealKnowledgeTagFromRank(slice.revealMinRank);
    entities.push({
      entityType: "truth",
      code,
      canonicalName: `school_cycle_${slice.id}`,
      title: `学制循环：${slice.title}`,
      summary: slice.body.slice(0, 120),
      detail: `${slice.title}\n${slice.body}`,
      scope: "global",
      ownerUserId: null,
      status: "active",
      sourceType: "bootstrap",
      sourceRef: "registry/schoolCycleCanon.ts",
      importance: 83,
      version: 1,
      tags: uniqueTags(["truth", "school_cycle", "yeliri", slice.id, rTag]),
    });
    addChunksForEntity(code, [`${slice.title}\n${slice.body}`], 83, chunks);
  }

  for (const cm of buildCycleMoonFlashFactsForCanon()) {
    const code = `truth:${cm.factKey}`;
    entities.push({
      entityType: "truth",
      code,
      canonicalName: cm.factKey.replace(/:/g, "_"),
      title: `时间闭环：${cm.factKey}`,
      summary: cm.canonicalText.slice(0, 120),
      detail: cm.canonicalText,
      scope: "global",
      ownerUserId: null,
      status: "active",
      sourceType: "bootstrap",
      sourceRef: "registry/cycleMoonFlashRegistry.ts",
      importance: 84,
      version: 1,
      tags: uniqueTags(cm.tags),
    });
    addChunksForEntity(code, [cm.canonicalText], 84, chunks);
  }

  for (const seed of SCHOOL_CYCLE_RETRIEVAL_SEEDS) {
    const code = seed.code;
    const rTag = schoolCycleRetrievalRevealTag(seed.revealMinRank);
    entities.push({
      entityType: "truth",
      code,
      canonicalName: seed.canonicalName,
      title: seed.title,
      summary: seed.summary.slice(0, 120),
      detail: `${seed.summary}\n${seed.detail}`,
      scope: "global",
      ownerUserId: null,
      status: "active",
      sourceType: "bootstrap",
      sourceRef: seed.sourceRef,
      importance: seed.importance,
      version: 1,
      tags: uniqueTags([...seed.tags, rTag, "bootstrap_pkg", "scope:global", "school_cycle_pkg"]),
    });
    addChunksForEntity(code, [`${seed.title}\n${seed.summary}\n${seed.detail}`], seed.importance, chunks);
  }

  for (const br of MAJOR_NPC_BRANCH_SEEDS) {
    const code = br.code;
    const rTag = revealKnowledgeTagFromRank(br.revealMinRank);
    entities.push({
      entityType: "truth",
      code,
      canonicalName: br.canonicalName,
      title: br.title,
      summary: br.summary.slice(0, 120),
      detail: `${br.summary}\n${br.detail}`,
      scope: "global",
      ownerUserId: null,
      status: "active",
      sourceType: "bootstrap",
      sourceRef: br.sourceRef,
      importance: br.importance,
      version: 1,
      tags: uniqueTags([
        ...br.tags,
        rTag,
        "scope:global",
        "major_npc_branch",
        `hook:${br.relatedQuestHook}`,
      ]),
    });
    addChunksForEntity(code, [`${br.title}\n${br.summary}\n${br.detail}`], br.importance, chunks);
  }

  for (const xp of buildPlayerExperienceSchoolCycleFactsForCanon()) {
    const code = `truth:${xp.factKey.replace(/:/g, "_")}`;
    entities.push({
      entityType: "truth",
      code,
      canonicalName: xp.factKey.replace(/:/g, "_"),
      title: `玩家体验层：${xp.factKey}`,
      summary: xp.canonicalText.slice(0, 120),
      detail: xp.canonicalText,
      scope: "global",
      ownerUserId: null,
      status: "active",
      sourceType: "bootstrap",
      sourceRef: "registry/playerExperienceSchoolCycleRegistry.ts",
      importance: 82,
      version: 1,
      tags: uniqueTags([...xp.tags, "scope:global"]),
    });
    addChunksForEntity(code, [xp.canonicalText], 82, chunks);
  }

  for (const slice of WORLD_ARC_BOOTSTRAP_SLICES) {
    const code = `truth:world_arc:${slice.id}`;
    const rTag = revealKnowledgeTagFromRank(slice.revealMinRank);
    entities.push({
      entityType: "truth",
      code,
      canonicalName: `world_arc_${slice.id}`,
      title: `世界弧：${slice.title}`,
      summary: slice.body.slice(0, 120),
      detail: `${slice.title}\n${slice.body}`,
      scope: "global",
      ownerUserId: null,
      status: "active",
      sourceType: "bootstrap",
      sourceRef: "registry/worldArcBootstrapSlices.ts",
      importance: 86,
      version: 1,
      tags: uniqueTags(["truth", "world_arc", "school_cycle", "major_npc", "yeliri", slice.id, rTag]),
    });
    addChunksForEntity(code, [`${slice.title}\n${slice.body}`], 86, chunks);
  }

  for (const npc of NPCS) {
    const code = `npc:${npc.id}`;
    entities.push({
      entityType: "npc",
      code,
      canonicalName: npc.id.toLowerCase(),
      title: npc.name,
      summary: `${npc.personality} / ${npc.specialty} / 战力 ${npc.combatPower}`,
      detail: npc.lore,
      scope: "global",
      ownerUserId: null,
      status: "active",
      sourceType: "bootstrap",
      sourceRef: "registry/npcs.ts",
      importance: npc.id === "N-011" ? 95 : 80,
      version: 1,
      tags: uniqueTags([
        "npc",
        npc.id,
        npc.floor,
        npc.personality,
        npc.specialty,
        ...npcEcologyTags(npc.id),
      ]),
    });

    const social = NPC_SOCIAL_GRAPH[npc.id];
    const npcChunks = [
      [
        `NPC：${npc.name}（${npc.id}）`,
        `位置：${npc.location}；楼层：${npc.floor}`,
        `性格：${npc.personality}；专长：${npc.specialty}`,
        `战力：${npc.combatPower}；默认好感：${npc.defaultFavorability}`,
        `外观：${npc.appearance}`,
      ].join("\n"),
      `禁忌：${npc.taboo}\n背景：${npc.lore}`,
      social
        ? [
            `固定设定：${social.fixed_lore}`,
            `核心渴望：${social.core_desires}`,
            `弱点：${social.weakness}`,
            `日程：${social.scheduleBehavior}`,
            `不可变关系：${social.immutable_relationships.join("；")}`,
          ].join("\n")
        : "",
      MAJOR_NPC_IDS.includes(npc.id as MajorNpcId)
        ? "【生态缝合】与同楼消化住户共用动线与规则；校源辅锚非局外副本，受任务、relink、reveal 门闸约束。"
        : npc.id === "N-011"
          ? "【生态缝合】消化账簿秩序面；与登记口、交换节点存在权限张力。"
          : "【生态缝合】消化链住户或污染残留；可产出传言、偏见、见证、旁证，与辅锚同楼共存。",
    ].filter(Boolean);
    addChunksForEntity(code, npcChunks, npc.id === "N-011" ? 95 : 80, chunks);

    if (social) {
      for (const [otherId, relationText] of Object.entries(social.relationships)) {
        edges.push({
          fromEntityCode: code,
          toEntityCode: `npc:${otherId}`,
          relationType: "social",
          relationLabel: relationText,
          strength: 60,
        });
      }
    }
  }

  for (const anomaly of ANOMALIES) {
    const code = `anomaly:${anomaly.id}`;
    entities.push({
      entityType: "anomaly",
      code,
      canonicalName: anomaly.id.toLowerCase(),
      title: anomaly.name,
      summary: `${anomaly.floor} 层 / 危险 ${anomaly.displayDangerLevel ?? anomaly.combatPower} / 理智伤害 ${anomaly.sanityDamage}`,
      detail: anomaly.floorMechanismTheme,
      scope: "global",
      ownerUserId: null,
      status: "active",
      sourceType: "bootstrap",
      sourceRef: "registry/anomalies.ts",
      importance: anomaly.id === "A-008" ? 98 : 82,
      version: 1,
      tags: uniqueTags(["anomaly", anomaly.id, anomaly.floor]),
    });
    addChunksForEntity(
      code,
      [
        `空间异常：${anomaly.name}（${anomaly.id}）\n楼层：${anomaly.floor}\n危险：${anomaly.displayDangerLevel ?? anomaly.combatPower}\n理智伤害：${anomaly.sanityDamage}`,
        `外观：${anomaly.appearance}`,
        `触发条件：${anomaly.triggerCondition}\n升级模式：${anomaly.escalationPattern}\n对策窗口：${anomaly.counterWindow}\n叙事职责：${anomaly.narrativeRole}`,
      ],
      anomaly.id === "A-008" ? 98 : 82,
      chunks
    );
  }

  for (const item of ITEMS) {
    const code = `item:${item.id}`;
    const tags = uniqueTags(["item", item.id, item.tier, ...item.tags.split(",")]);
    entities.push({
      entityType: "item",
      code,
      canonicalName: item.id.toLowerCase(),
      title: item.name,
      summary: `${item.tier} 级道具`,
      detail: item.description,
      scope: "global",
      ownerUserId: null,
      status: "active",
      sourceType: "bootstrap",
      sourceRef: "registry/items.ts",
      importance: item.tier === "S" ? 95 : item.tier === "A" ? 85 : 70,
      version: 1,
      tags,
    });
    addChunksForEntity(
      code,
      [
        `道具：${item.name}（${item.id}）\n等级：${item.tier}\n描述：${item.description}`,
        [
          `效果摘要：${item.effectSummary ?? "无"}`,
          `效果类型：${item.effectType ?? "unknown"}`,
          `标签：${item.tags}`,
          `属性要求：${item.statRequirements ? JSON.stringify(item.statRequirements) : "无"}`,
        ].join("\n"),
      ],
      item.tier === "S" ? 95 : item.tier === "A" ? 85 : 70,
      chunks
    );
    edges.push({
      fromEntityCode: code,
      toEntityCode: entityCodeByActorId(item.ownerId),
      relationType: "owned_by",
      relationLabel: "registry owner",
      strength: 80,
    });
  }

  for (const item of WAREHOUSE_ITEMS) {
    const code = `item:${item.id}`;
    entities.push({
      entityType: "item",
      code,
      canonicalName: item.id.toLowerCase(),
      title: item.name,
      summary: `${item.floor} 楼层来源仓库物品`,
      detail: item.description,
      scope: "global",
      ownerUserId: null,
      status: "active",
      sourceType: "bootstrap",
      sourceRef: "registry/warehouseItems.ts",
      importance: item.floor === "B2" ? 92 : item.floor === "7" ? 88 : 68,
      version: 1,
      tags: uniqueTags(["warehouse_item", "item", item.id, item.floor, item.isResurrection ? "resurrection" : ""]),
    });
    addChunksForEntity(
      code,
      [
        `仓库物品：${item.name}（${item.id}）\n来源楼层：${item.floor}\n描述：${item.description}`,
        `收益：${item.benefit}\n副作用：${item.sideEffect}`,
      ],
      item.floor === "B2" ? 92 : item.floor === "7" ? 88 : 68,
      chunks
    );
    edges.push({
      fromEntityCode: code,
      toEntityCode: entityCodeByActorId(item.ownerId),
      relationType: "owned_by",
      relationLabel: "warehouse owner",
      strength: 80,
    });
  }

  return { entities, edges, chunks };
}
