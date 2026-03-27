import type { GameTaskV2 } from "@/lib/tasks/taskV2";
import { CONTENT_PACKS } from "./packs";
import { buildGameTaskV2FromTaskSpec } from "./taskBuilders";

export function buildStarterTasksFromContentSpecs(): GameTaskV2[] {
  return CONTENT_PACKS.flatMap((p) => p.taskSpecs ?? [])
    .map((s) => buildGameTaskV2FromTaskSpec(s))
    .filter((x): x is GameTaskV2 => !!x);
}

