import { z } from "zod";

/**
 * DM 事件驱动变更集（可选顶层字段 `dm_change_set`）。
 * 模型输出「候选」，由规则层折叠进既有 legacy 字段（new_tasks / clue_updates / awarded_* / relationship_updates）。
 */
const objectiveCandidateSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().min(1).max(200),
  desc: z.string().max(2000).optional(),
  goal_kind: z.enum(["main", "promise", "commission"]).optional(),
  /** 模型声明：本目标已在 narrative 中让玩家可见（仍经服务端弱校验） */
  surfaced_in_narrative: z.boolean().optional(),
  issuer_id: z.string().max(64).optional(),
  issuer_name: z.string().max(64).optional(),
  /** 阶段 6：叙事门槛——推进所需物品 id（注册表或已结构化写回） */
  required_item_ids: z.array(z.string().min(1).max(80)).max(8).optional(),
  /** 由哪条手记升格而来（弱引用 clue id） */
  source_clue_id: z.string().max(80).optional(),
});

const discoveredClueSchema = z.object({
  title: z.string().min(1).max(200),
  detail: z.string().max(2000).optional(),
  kind: z.string().max(32).optional(),
  /** 成熟后可生成的正式目标 id（由 DM 声明，客户端/DM 协同） */
  matures_to_objective_id: z.string().max(80).optional(),
});

const obtainedItemSchema = z.object({
  item_id: z.string().min(1).max(80),
  tier_hint: z.enum(["S", "A", "B", "C", "D"]).optional(),
  is_key_item: z.boolean().optional(),
});

const itemStateChangeSchema = z.object({
  item_id: z.string().min(1).max(80),
  action: z.enum(["consume", "lose", "mark_used", "transfer_to_warehouse"]),
});

const relationshipImpactSchema = z.object({
  npcId: z.string().min(1).max(64),
  favorability: z.number().optional(),
  trust: z.number().optional(),
  fear: z.number().optional(),
  debt: z.number().optional(),
  affection: z.number().optional(),
  desire: z.number().optional(),
});

export const dmChangeSetSchemaV1 = z.object({
  version: z.literal(1).optional(),
  narrative_text: z.string().max(50_000).optional(),
  scene_changes: z.array(z.string().max(400)).max(12).optional(),
  npc_promises: z.array(objectiveCandidateSchema).max(4).optional(),
  commissions: z.array(objectiveCandidateSchema).max(4).optional(),
  discovered_clues: z.array(discoveredClueSchema).max(12).optional(),
  obtained_items: z.array(obtainedItemSchema).max(8).optional(),
  item_state_changes: z.array(itemStateChangeSchema).max(12).optional(),
  objective_candidates: z.array(objectiveCandidateSchema).max(6).optional(),
  world_risks: z.array(z.string().max(200)).max(8).optional(),
  time_pressure: z.enum(["none", "low", "medium", "high"]).optional(),
  relationship_impacts: z.array(relationshipImpactSchema).max(12).optional(),
});

export type DmChangeSetV1 = z.infer<typeof dmChangeSetSchemaV1>;
export type ObjectiveCandidateV1 = z.infer<typeof objectiveCandidateSchema>;
