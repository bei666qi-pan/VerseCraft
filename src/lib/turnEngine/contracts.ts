import type { TokenUsage } from "@/lib/ai/types";
import type { MapId, WorldId } from "@/lib/worlds/types";

export type TurnLane = "narrative" | "mechanics";

export interface ActualAiUsage {
  requestId: string;
  runId: string;
  task: string;
  lane: TurnLane | "director";
  round: number;
  providerId: string;
  latencyMs: number;
  usage: TokenUsage | null;
}

/** Model output is advisory until the sole TurnFinalizer commits it. */
export interface TurnCandidate {
  source: "writer" | "mechanics";
  narrative: string;
  usage: ActualAiUsage[];
}

/** A deterministic tool result carried to the TurnFinalizer; it is not an authoritative commit. */
export interface MechanicsReceipt {
  callId: string;
  toolName: string;
  access: "read" | "write";
  worldId: string;
  sessionId: string;
  idempotencyKey: string;
  ok: boolean;
  latencyMs: number;
  result?: unknown;
  error?: string;
}

/** The only input accepted by the asynchronous WorldDirectorWorkflow. */
export interface CommittedTurnReceipt {
  id: string;
  requestId: string;
  worldId: WorldId;
  mapId: MapId;
  sessionId: string;
  turnIndex: number;
  committedAt: string;
  lane: TurnLane;
}

export interface PacingChapterSignalsV2 {
  chapterId: string;
  phase: "opening" | "rising" | "turning" | "climax" | "resolution";
  tension: 0 | 1 | 2 | 3 | 4 | 5;
  completedBeatIds: string[];
  turnsInChapter: number;
}

export interface DirectorPlanV2 {
  schemaVersion: "director_plan_v2";
  npcActions: Array<{ npcId: string; action: string; sourceIds: string[] }>;
  agenda: Array<{ eventId: string; dueTurn: number; sourceIds: string[] }>;
  chapterDirection: { phase: PacingChapterSignalsV2["phase"]; sourceIds: string[] };
  constraints: string[];
}

export interface DirectorDirective {
  directiveId: string;
  npcActionIds: string[];
  dueEventIds: string[];
  chapterPhase: PacingChapterSignalsV2["phase"];
  constraintIds: string[];
}
