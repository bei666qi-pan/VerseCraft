import { ANOMALIES } from "@/lib/registry/anomalies";
import { APARTMENT_SYSTEM_CANON, APARTMENT_TRUTH } from "@/lib/registry/apartmentTruth";
import { ITEMS } from "@/lib/registry/items";
import { NPCS } from "@/lib/registry/npcs";
import { APARTMENT_RULES } from "@/lib/registry/rules";
import { WAREHOUSE_ITEMS } from "@/lib/registry/warehouseItems";
import { FLOORS, MAP_ROOMS, NPC_SOCIAL_GRAPH } from "@/lib/registry/world";
import { FLOOR_DIGESTION_AXES, REVEAL_TIERS } from "@/lib/registry/worldCanon";

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
    canonicalName: "apartment_truth",
    title: "如月公寓真相档案",
    summary: "公寓本质、结构、时间线、暗月与出口机制。",
    detail: APARTMENT_TRUTH.trim(),
    scope: "global",
    ownerUserId: null,
    status: "active",
    sourceType: "bootstrap",
    sourceRef: "registry/apartmentTruth.ts",
    importance: 100,
    version: 1,
    tags: ["core", "truth", "apartment", "world_mechanism", "reveal_surface"],
  });
  addChunksForEntity("truth:apartment", splitChunksByMaxLen(APARTMENT_TRUTH.split("\n\n"), 1000), 100, chunks);

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
    title: "如月公寓守则",
    summary: "规则一至规则十，真假参半但可执行。",
    detail: APARTMENT_RULES.join("\n"),
    scope: "global",
    ownerUserId: null,
    status: "active",
    sourceType: "bootstrap",
    sourceRef: "registry/rules.ts",
    importance: 95,
    version: 1,
    tags: ["rule", "compliance", "apartment"],
  });
  addChunksForEntity(
    "rule:apartment",
    APARTMENT_RULES.map((x, idx) => `${idx + 1}. ${x}`),
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
      tags: uniqueTags(["npc", npc.id, npc.floor, npc.personality, npc.specialty]),
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
      summary: `${anomaly.floor} 层 / 战力 ${anomaly.combatPower} / 理智伤害 ${anomaly.sanityDamage}`,
      detail: anomaly.killingRule,
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
        `诡异：${anomaly.name}（${anomaly.id}）\n楼层：${anomaly.floor}\n战力：${anomaly.combatPower}\n理智伤害：${anomaly.sanityDamage}`,
        `外观：${anomaly.appearance}`,
        `杀戮规则：${anomaly.killingRule}\n生存方法：${anomaly.survivalMethod}`,
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
