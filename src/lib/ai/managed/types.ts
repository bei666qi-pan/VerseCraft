import type { AiLogicalRole } from "@/lib/ai/models/logicalRoles";
import type { TaskType } from "@/lib/ai/types/core";

export const AI_PURPOSES = ["story", "rules", "polish", "background", "embedding", "judge"] as const;
export type AiPurpose = (typeof AI_PURPOSES)[number];
export type ManagedTransport = "openai_compatible" | "openai_responses" | "ark_multimodal" | "mock";

export function normalizeManagedTransportInput(
  value: unknown,
  allowMock = false,
): ManagedTransport {
  if (value === "openai_responses") return "openai_responses";
  if (value === "ark_multimodal") return "ark_multimodal";
  if (allowMock && value === "mock") return "mock";
  return "openai_compatible";
}

export type ManagedAiBinding = Readonly<{
  serviceId: string;
  serviceName: string;
  modelId: string;
  modelName: string;
  baseUrl: string;
  apiKey: string;
  transport: ManagedTransport;
  purpose: AiPurpose;
  logicalRole: AiLogicalRole;
  embeddingDimension: number | null;
  inputPriceCnyFenPerMillion: number | null;
  outputPriceCnyFenPerMillion: number | null;
}>;

export type ManagedAiSnapshot = Readonly<{
  version: number;
  loadedAt: number;
  ready: boolean;
  health: "ready" | "missing_encryption_key" | "decrypt_failed" | "database_unavailable" | "not_initialized";
  byPurpose: Readonly<Record<AiPurpose, readonly ManagedAiBinding[]>>;
}>;

const TASK_PURPOSE: Record<TaskType, AiPurpose> = {
  PLAYER_CHAT: "story", DM_AGENT: "story", COMBAT_NARRATION: "story", GAMEPLAY_LOCALIZATION: "story",
  PLAYER_CONTROL_PREFLIGHT: "rules", INTENT_PARSE: "rules", SAFETY_PREFILTER: "rules", RULE_RESOLUTION: "rules",
  SCENE_ENHANCEMENT: "polish", NARRATIVE_EXPANSION: "polish", NPC_EMOTION_POLISH: "polish",
  WORLDBUILD_OFFLINE: "background", STORYLINE_SIMULATION: "background", DIRECTOR_PLAN_CRITIC: "background",
  DEV_ASSIST: "background", MEMORY_COMPRESSION: "background", EVAL_JUDGE: "judge",
};

export function purposeForTask(task: TaskType): AiPurpose {
  return TASK_PURPOSE[task];
}

export function roleForPurpose(purpose: AiPurpose): AiLogicalRole {
  if (purpose === "story") return "writer";
  if (purpose === "rules") return "control";
  if (purpose === "polish") return "enhance";
  return "reasoner";
}

export const AI_PURPOSE_LABELS: Record<AiPurpose, string> = {
  story: "玩家故事生成", rules: "规则判断", polish: "文字润色", background: "后台推演", embedding: "知识检索",
};
