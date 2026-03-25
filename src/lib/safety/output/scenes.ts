import type { ModerationScene, ModerationStage } from "@/lib/safety/policy/model";

export type OutputSceneKind = "private_story_output" | "codex_output" | "task_output" | "public_display_output";

export function resolveOutputSceneAndStage(kind: OutputSceneKind): { scene: ModerationScene; stage: ModerationStage } {
  switch (kind) {
    case "private_story_output":
      return { scene: "private_story_output", stage: "output" };
    case "codex_output":
      return { scene: "codex_text", stage: "output" };
    case "task_output":
      return { scene: "task_text", stage: "output" };
    case "public_display_output":
      return { scene: "public_share", stage: "public_display" };
    default:
      // Exhaustiveness guard (should never happen).
      return { scene: "private_story_output", stage: "output" };
  }
}

