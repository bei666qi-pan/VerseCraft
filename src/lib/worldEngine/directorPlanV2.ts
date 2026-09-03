import type { DirectorPlanV2, PacingChapterSignalsV2 } from "@/lib/turnEngine/contracts";
import type { DirectorPhase, WorldEngineStructuredDelta } from "./contracts";

const PHASE_MAP: Record<DirectorPhase, PacingChapterSignalsV2["phase"]> = {
  quiet: "opening",
  build_up: "rising",
  pressure: "turning",
  release: "resolution",
  reveal: "climax",
  recovery: "resolution",
};

function boundedId(prefix: string, value: unknown): string {
  const id = String(value ?? "")
    .trim()
    .replace(/[^A-Za-z0-9:_-]/g, "")
    .slice(0, 128);
  return `${prefix}:${id || "unknown"}`;
}

/** Projects the validated provider wire shape into the sole internal Director contract. */
export function projectDirectorPlanV2(args: {
  plan: WorldEngineStructuredDelta;
  turnIndex: number;
  chapterId: string | null;
}): DirectorPlanV2 {
  const turnIndex = Math.max(0, Math.trunc(args.turnIndex));
  const chapterSources = [
    ...(args.chapterId ? [boundedId("chapter", args.chapterId)] : []),
    boundedId("turn", turnIndex),
  ];
  return {
    schemaVersion: "director_plan_v2",
    npcActions: args.plan.npc_next_actions.slice(0, 8).map((action) => ({
      npcId: String(action.npc_code).slice(0, 128),
      action: String(action.action).slice(0, 300),
      sourceIds: [boundedId("npc", action.npc_code)],
    })),
    agenda: args.plan.world_events_to_schedule.slice(0, 12).map((event) => ({
      eventId: String(event.event_code).slice(0, 128),
      dueTurn: turnIndex + Math.max(0, Math.trunc(event.due_in_turns)),
      sourceIds: [boundedId("event", event.event_code)],
    })),
    chapterDirection: {
      phase: PHASE_MAP[args.plan.target_phase] ?? "opening",
      sourceIds: chapterSources,
    },
    constraints: [...new Set(args.plan.consistency_warnings
      .map((warning) => boundedId("warning", warning.code)))]
      .slice(0, 16),
  };
}
