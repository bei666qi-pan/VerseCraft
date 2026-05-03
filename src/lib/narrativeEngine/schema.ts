import { z } from "zod";

export const MODEL_OUTPUT_FALLBACK_NARRATIVE =
  "我停了一下，意识到眼前的信息还不足以支撑这个判断。眼下最稳妥的做法，是先确认周围环境，再决定下一步。";

export const ModelTurnModeSchema = z.enum([
  "narrative_only",
  "decision_required",
  "system_transition",
]);

export const ModelEventCandidateTypeSchema = z.enum([
  "player_action",
  "npc_reply",
  "state_change",
  "fact_unlock",
  "clue_found",
  "task_started",
  "task_updated",
  "relationship_changed",
  "consistency_degrade",
]);

export const ModelActorTypeSchema = z.enum(["player", "npc", "system"]);

export const ModelStateChangesSchema = z
  .strictObject({
    playerLocation: z.string().trim().min(1).nullable().optional(),
    sanityDelta: z.number().finite().nullable().optional(),
    hpDelta: z.number().finite().nullable().optional(),
    originiumDelta: z.number().finite().nullable().optional(),
    timeCost: z
      .enum(["free", "light", "standard", "heavy", "dangerous"])
      .nullable()
      .optional(),
    taskUpdates: z.array(z.record(z.string(), z.unknown())).optional(),
    relationshipUpdates: z.array(z.record(z.string(), z.unknown())).optional(),
    clueUpdates: z.array(z.record(z.string(), z.unknown())).optional(),
  })
  .default({});

export const ModelEventCandidateSchema = z.strictObject({
  type: ModelEventCandidateTypeSchema,
  actorType: ModelActorTypeSchema,
  actorId: z.string().trim().min(1).nullable().optional(),
  summary: z.string().trim().min(1),
  payload: z.record(z.string(), z.unknown()),
});

export const ModelOutputZodSchema = z.strictObject({
  narrative: z.string().trim().min(1),
  turnMode: ModelTurnModeSchema,
  decisionOptions: z.array(z.string().trim().min(1)).max(4),
  stateChanges: ModelStateChangesSchema,
  eventCandidates: z.array(ModelEventCandidateSchema),
  revealAttempts: z.array(z.string().trim().min(1)),
  consistencyNotes: z.array(z.string().trim().min(1)),
});

export type ModelOutputSchema = z.infer<typeof ModelOutputZodSchema>;

export const MODEL_OUTPUT_STRICT_JSON_SCHEMA = {
  name: "VerseCraftNarrativeModelOutput",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "narrative",
      "turnMode",
      "decisionOptions",
      "stateChanges",
      "eventCandidates",
      "revealAttempts",
      "consistencyNotes",
    ],
    properties: {
      narrative: { type: "string", minLength: 1 },
      turnMode: {
        type: "string",
        enum: ["narrative_only", "decision_required", "system_transition"],
      },
      decisionOptions: {
        type: "array",
        maxItems: 4,
        items: { type: "string", minLength: 1 },
      },
      stateChanges: {
        type: "object",
        additionalProperties: false,
        properties: {
          playerLocation: { anyOf: [{ type: "string", minLength: 1 }, { type: "null" }] },
          sanityDelta: { anyOf: [{ type: "number" }, { type: "null" }] },
          hpDelta: { anyOf: [{ type: "number" }, { type: "null" }] },
          originiumDelta: { anyOf: [{ type: "number" }, { type: "null" }] },
          timeCost: {
            anyOf: [
              { type: "string", enum: ["free", "light", "standard", "heavy", "dangerous"] },
              { type: "null" },
            ],
          },
          taskUpdates: {
            type: "array",
            items: { type: "object", additionalProperties: true },
          },
          relationshipUpdates: {
            type: "array",
            items: { type: "object", additionalProperties: true },
          },
          clueUpdates: {
            type: "array",
            items: { type: "object", additionalProperties: true },
          },
        },
      },
      eventCandidates: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["type", "actorType", "summary", "payload"],
          properties: {
            type: {
              type: "string",
              enum: [
                "player_action",
                "npc_reply",
                "state_change",
                "fact_unlock",
                "clue_found",
                "task_started",
                "task_updated",
                "relationship_changed",
                "consistency_degrade",
              ],
            },
            actorType: { type: "string", enum: ["player", "npc", "system"] },
            actorId: { anyOf: [{ type: "string", minLength: 1 }, { type: "null" }] },
            summary: { type: "string", minLength: 1 },
            payload: { type: "object", additionalProperties: true },
          },
        },
      },
      revealAttempts: {
        type: "array",
        items: { type: "string", minLength: 1 },
      },
      consistencyNotes: {
        type: "array",
        items: { type: "string", minLength: 1 },
      },
    },
  },
} as const;

export function buildFallbackModelOutput(narrative = MODEL_OUTPUT_FALLBACK_NARRATIVE): ModelOutputSchema {
  return {
    narrative,
    turnMode: "narrative_only",
    decisionOptions: [],
    stateChanges: {},
    eventCandidates: [
      {
        type: "consistency_degrade",
        actorType: "system",
        actorId: null,
        summary: "模型输出未通过叙事一致性校验，已降级为保守反馈。",
        payload: {},
      },
    ],
    revealAttempts: [],
    consistencyNotes: ["safe_fallback_applied"],
  };
}
