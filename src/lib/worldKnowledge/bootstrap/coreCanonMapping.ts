/**
 * CoreCanon facts seed 映射（纯内存 scaffold）。
 *
 * 目标：
 * - 将当前 `src/lib/registry/*` 中的“静态世界观事实”映射为 `LoreFact[]`
 * - 不写入数据库、不触发任何 RAG/检索/注入业务
 *
 * 后续 ingestion/bootstrap 会把这些 facts 写入 PostgreSQL（fact store），并生成 embedding/tag 索引。
 */

import type { LoreFact, LoreFactType, LoreSourceKind, WorldKnowledgeLayer } from "../types";
import { NPCS } from "@/lib/registry/npcs";
import { ANOMALIES } from "@/lib/registry/anomalies";
import { ITEMS } from "@/lib/registry/items";
import { APARTMENT_RULES } from "@/lib/registry/rules";
import { APARTMENT_SYSTEM_CANON, APARTMENT_TRUTH } from "@/lib/registry/apartmentTruth";
import {
  FLOORS,
  MAP_ROOMS,
  NPC_SOCIAL_GRAPH,
  MANAGER_NPC_ID,
  MANAGER_TRUE_COMBAT_POWER,
  B2_BOSS_ID,
  B2_BOSS_LOCKED_FAVORABILITY,
} from "@/lib/registry/world";
import { FLOOR_DIGESTION_AXES, REVEAL_TIERS } from "@/lib/registry/worldCanon";
import { buildSchoolCycleLoreFactsForCanon } from "@/lib/registry/schoolCycleCanon";
import { buildCycleMoonFlashFactsForCanon } from "@/lib/registry/cycleMoonFlashRegistry";
import { buildWorldArcBootstrapFactsForCanon } from "@/lib/registry/worldArcBootstrapSlices";
import { buildSchoolCycleRetrievalFactsForCanon } from "@/lib/registry/schoolCycleRetrievalSeeds";
import { buildMajorNpcBranchFactsForCanon } from "@/lib/registry/majorNpcBranchSeeds";
import { buildPlayerExperienceSchoolCycleFactsForCanon } from "@/lib/registry/playerExperienceSchoolCycleRegistry";

function mkFactIdentity(factKey: string): { factKey: string } {
  return { factKey };
}

function mkSource(kind: LoreSourceKind, entityId?: string): LoreFact["source"] {
  return { kind, entityId };
}

function mkFact(args: {
  layer: WorldKnowledgeLayer;
  factType: LoreFactType;
  factKey: string;
  canonicalText: string;
  tags?: string[];
  source: LoreFact["source"];
}): LoreFact {
  return {
    identity: mkFactIdentity(args.factKey),
    layer: args.layer,
    factType: args.factType,
    canonicalText: args.canonicalText,
    normalizedHash: args.factKey,
    tags: args.tags,
    source: args.source,
    isHot: args.layer === "core_canon",
  };
}

function factKeyForEntity(prefix: string, id: string): string {
  return `${prefix}:${id}`;
}

export function buildCoreCanonFactsFromRegistry(): LoreFact[] {
  const facts: LoreFact[] = [];

  // 1) 建筑本质/诡异化机制/禁忌词/暗月/出口等“世界机制真相档案”
  facts.push(
    mkFact({
      layer: "core_canon",
      factType: "world_mechanism",
      factKey: "core:apartment_truth",
      canonicalText: APARTMENT_TRUTH,
      tags: ["core", "truth", "mechanism", "apartment", "reveal_surface"],
      source: mkSource("registry"),
    })
  );
  facts.push(
    mkFact({
      layer: "core_canon",
      factType: "world_mechanism",
      factKey: "core:apartment_system_canon",
      canonicalText: APARTMENT_SYSTEM_CANON,
      tags: ["core", "system_causality", "apartment", "reveal_fracture"],
      source: mkSource("registry"),
    })
  );

  // 2) 守则规则块（系统与合规硬约束的“世界内规则”）
  facts.push(
    mkFact({
      layer: "core_canon",
      factType: "rule",
      factKey: "core:apartment_rules",
      canonicalText: APARTMENT_RULES.join("\n"),
      tags: ["rules", "apartment"],
      source: mkSource("registry"),
    })
  );

  // 3) 楼层结构与地图节点
  for (const f of FLOORS) {
    facts.push(
      mkFact({
        layer: "core_canon",
        factType: "location",
        factKey: factKeyForEntity("core:floor", f.id),
        canonicalText: `楼层：${f.label}\n描述：${f.description}`,
        tags: ["floor", f.id],
        source: mkSource("registry", f.id),
      })
    );
  }
  for (const [floorId, nodes] of Object.entries(MAP_ROOMS)) {
    facts.push(
      mkFact({
        layer: "core_canon",
        factType: "location",
        factKey: factKeyForEntity("core:map_rooms", floorId),
        canonicalText: `楼层 ${floorId} 可遍历房间节点：${nodes.join("，")}`,
        tags: ["map_rooms", floorId],
        source: mkSource("registry", floorId),
      })
    );
  }

  for (const [floorId, axis] of Object.entries(FLOOR_DIGESTION_AXES)) {
    facts.push(
      mkFact({
        layer: "shared_public_lore",
        factType: "world_mechanism",
        factKey: factKeyForEntity("floor:digestion_axis", floorId),
        canonicalText: [
          `楼层 ${floorId} 消化轴`,
          `公开主题：${axis.publicTheme}`,
          `隐秘主题：${axis.hiddenTheme}`,
          `阶段：${axis.digestionStage}`,
          `主威胁映射：${axis.mainThreatMapping}`,
          `真相进度：${axis.truthProgress}`,
          `系统自然化：${axis.systemNaturalization.join("；")}`,
          `职业偏好：${axis.professionBias.join("、")}`,
        ].join("\n"),
        tags: ["floor_axis", floorId, "digestion", "threat", "reveal_fracture"],
        source: mkSource("registry", floorId),
      })
    );
  }

  for (const tier of REVEAL_TIERS) {
    facts.push(
      mkFact({
        layer: "shared_public_lore",
        factType: "system_hint",
        factKey: factKeyForEntity("reveal:tier", tier.id),
        canonicalText: [
          `揭露层：${tier.title}`,
          `触发信号：${tier.unlockSignals.join("；")}`,
          `披露策略：${tier.revealPolicy}`,
        ].join("\n"),
        tags: ["reveal_tier", tier.id, "reveal_surface"],
        source: mkSource("registry"),
      })
    );
  }

  for (const sc of buildSchoolCycleLoreFactsForCanon()) {
    facts.push(
      mkFact({
        layer: "shared_public_lore",
        factType: "world_mechanism",
        factKey: sc.factKey,
        canonicalText: sc.canonicalText,
        tags: sc.tags,
        source: mkSource("registry"),
      })
    );
  }

  for (const cm of buildCycleMoonFlashFactsForCanon()) {
    facts.push(
      mkFact({
        layer: "shared_public_lore",
        factType: "world_mechanism",
        factKey: cm.factKey,
        canonicalText: cm.canonicalText,
        tags: cm.tags,
        source: mkSource("registry"),
      })
    );
  }

  for (const pk of buildSchoolCycleRetrievalFactsForCanon()) {
    facts.push(
      mkFact({
        layer: "shared_public_lore",
        factType: "world_mechanism",
        factKey: pk.factKey,
        canonicalText: pk.canonicalText,
        tags: pk.tags,
        source: mkSource("registry", "schoolCycleRetrievalSeeds"),
      })
    );
  }

  for (const br of buildMajorNpcBranchFactsForCanon()) {
    facts.push(
      mkFact({
        layer: "shared_public_lore",
        factType: "world_mechanism",
        factKey: br.factKey,
        canonicalText: br.canonicalText,
        tags: br.tags,
        source: mkSource("registry", "majorNpcBranchSeeds"),
      })
    );
  }

  for (const xp of buildPlayerExperienceSchoolCycleFactsForCanon()) {
    facts.push(
      mkFact({
        layer: "shared_public_lore",
        factType: "world_mechanism",
        factKey: xp.factKey,
        canonicalText: xp.canonicalText,
        tags: xp.tags,
        source: mkSource("registry", "playerExperienceSchoolCycleRegistry"),
      })
    );
  }

  for (const wa of buildWorldArcBootstrapFactsForCanon()) {
    facts.push(
      mkFact({
        layer: "shared_public_lore",
        factType: "world_mechanism",
        factKey: wa.factKey,
        canonicalText: wa.canonicalText,
        tags: wa.tags,
        source: mkSource("registry"),
      })
    );
  }

  // 4) NPC 固定人设与社会关系（fixed_lore/core_desires/immutable_relationships/weakness/taboo）
  for (const npc of NPCS) {
    facts.push(
      mkFact({
        layer: "core_canon",
        factType: "npc",
        factKey: factKeyForEntity("npc", npc.id),
        canonicalText: [
          `NPC：${npc.name}（${npc.id}）`,
          `位置：${npc.location}`,
          `性格：${npc.personality}；专长：${npc.specialty}`,
          `战力：${npc.combatPower}`,
          `外观：${npc.appearance}`,
          `禁忌（taboo）：${npc.taboo}`,
          `固定人设（lore）：${npc.lore}`,
        ].join("\n"),
        tags: ["npc", npc.id, npc.floor],
        source: mkSource("registry", npc.id),
      })
    );

    const social = NPC_SOCIAL_GRAPH[npc.id];
    if (social) {
      facts.push(
        mkFact({
          layer: "core_canon",
          factType: "relationship",
          factKey: factKeyForEntity("npc:weakness_taboo", npc.id),
          canonicalText: `弱点：${social.weakness}\n日程：${social.scheduleBehavior}\n核心渴望：${social.core_desires}`,
          tags: ["npc_social", npc.id, "weakness"],
          source: mkSource("registry", npc.id),
        })
      );

      // immutable_relationships：不可改的人心线索
      facts.push(
        mkFact({
          layer: "core_canon",
          factType: "relationship",
          factKey: factKeyForEntity("npc:immutable", npc.id),
          canonicalText: `不可动情感/关系线程：${social.immutable_relationships.join("；")}`,
          tags: ["npc_social", npc.id, "immutable"],
          source: mkSource("registry", npc.id),
        })
      );

      // relationships：指向其它实体的关系文本
      for (const [otherId, relText] of Object.entries(social.relationships)) {
        facts.push(
          mkFact({
            layer: "core_canon",
            factType: "relationship",
            factKey: factKeyForEntity("npc:rel", `${npc.id}->${otherId}`),
            canonicalText: `关系：${npc.id} 相关于 ${otherId}\n${relText}`,
            tags: ["relationship", npc.id, otherId],
            source: mkSource("registry", otherId),
          })
        );
      }
    }
  }

  // 5) 诡异实体：外观/杀戮规则/生存方法/精神损伤
  for (const a of ANOMALIES) {
    facts.push(
      mkFact({
        layer: "core_canon",
        factType: "anomaly",
        factKey: factKeyForEntity("anomaly", a.id),
        canonicalText: [
          `诡异：${a.name}（${a.id}）`,
          `楼层：${a.floor}；战力：${a.combatPower}`,
          `外观：${a.appearance}`,
          `杀戮规则：${a.killingRule}`,
          `生存方法：${a.survivalMethod}`,
          `理智伤害：${a.sanityDamage}`,
        ].join("\n"),
        tags: ["anomaly", a.id, a.floor],
        source: mkSource("registry", a.id),
      })
    );
  }

  // 6) 道具：以“用于检索/解释”的描述文本为主（后续运行时再按 factType/itemId 精确注入裁剪）
  for (const it of ITEMS) {
    facts.push(
      mkFact({
        layer: "core_canon",
        factType: "item",
        factKey: factKeyForEntity("item", it.id),
        canonicalText: [
          `道具：${it.name}（${it.id}）`,
          `等级：${it.tier}`,
          `描述：${it.description}`,
          `效果摘要：${it.effectSummary ?? ""}`.trim(),
          `标签：${it.tags}`,
          `使用/属性要求：${it.statRequirements ? JSON.stringify(it.statRequirements) : "无"}`,
        ].join("\n"),
        tags: ["item", it.id, it.tier, ...(it.tags ? String(it.tags).split(",").map((x) => x.trim()) : [])],
        source: mkSource("registry", it.ownerId),
      })
    );
  }

  // 7) 关键世界锚点（管理者/深渊守门人等“不可误读”的硬锚）
  facts.push(
    mkFact({
      layer: "core_canon",
      factType: "system_hint",
      factKey: "core:manager_anchor",
      canonicalText: [
        `管理者 NPC：${MANAGER_NPC_ID}`,
        `真实战力（硬锚）：${MANAGER_TRUE_COMBAT_POWER}`,
        `含义：用于引导模型避免把图鉴/表面战力当作真实管理者能力。`,
      ].join("\n"),
      tags: ["anchor", "manager"],
      source: mkSource("registry"),
    })
  );
  facts.push(
    mkFact({
      layer: "core_canon",
      factType: "system_hint",
      factKey: "core:boss_anchor",
      canonicalText: [
        `出口 Boss：${B2_BOSS_ID}`,
        `好感度锁定：${B2_BOSS_LOCKED_FAVORABILITY}`,
        `含义：用于引导模型在对话与交互中保持出口 Boss 的不可提升约束。`,
      ].join("\n"),
      tags: ["anchor", "boss"],
      source: mkSource("registry"),
    })
  );

  return facts;
}

