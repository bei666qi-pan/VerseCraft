// src/lib/langgraph/directorHintBuilder.ts
/**
 * Pure function that builds the directorHintBlock from structured director state.
 *
 * The hint block is a directional constraint injected into the writing agent's
 * system prompt. It provides guidance on story phase, progression direction,
 * key event types, pacing requirements, and prohibitions — but does NOT contain
 * specific dialogue, scene descriptions, or narrative facts.
 *
 * Contract:
 * - Input: structured delta, director state, hasPlan flag
 * - Output: formatted string block suitable for prompt assembly
 */

import type { WorldEngineStructuredDelta } from "@/lib/worldEngine/contracts";
import type { WorldDirectorState } from "@/lib/worldEngine/directorState";

export interface DirectorHintInput {
  hasPlan: boolean;
  planConfidence: "none" | "degraded" | "normal";
  structuredDelta: WorldEngineStructuredDelta | null;
  directorState: WorldDirectorState | null;
}

/**
 * Build the director hint block for injection into the writing agent's prompt.
 *
 * When hasPlan=false, returns empty string (writing agent operates autonomously).
 * When hasPlan=true with normal confidence, returns full directional guidance.
 * When hasPlan=true with degraded confidence, returns simplified guidance.
 */
export function buildDirectorHintBlock(input: DirectorHintInput): string {
  if (!input.hasPlan || !input.structuredDelta || !input.directorState) {
    return "";
  }

  const delta = input.structuredDelta;
  const _directorState = input.directorState;
  const isDegraded = input.planConfidence === "degraded";

  const lines: string[] = [];

  lines.push("## 导演方向指引");
  lines.push("遵循以下方向规划剧情走向，具体事件和对话由你自行创作。");
  lines.push("");

  // Phase
  if (delta.current_phase) {
    lines.push(`- 当前剧情阶段: ${delta.current_phase}`);
  }
  if (delta.target_phase && delta.target_phase !== delta.current_phase) {
    lines.push(`- 目标阶段: ${delta.target_phase}`);
  }

  // Director intent (core direction)
  if (delta.director_intent) {
    lines.push(`- 推进方向: "${delta.director_intent}"`);
  }

  // Pacing (simplified in degraded mode)
  if (delta.pacing_assessment && !isDegraded) {
    const p = delta.pacing_assessment;
    const pacingHints: string[] = [];
    if (p.tension >= 70) pacingHints.push("保持高压氛围");
    if (p.tension <= 30) pacingHints.push("节奏可适当放缓");
    if (p.mystery >= 70) pacingHints.push("逐步释放谜团线索");
    if (p.fatigue >= 70) pacingHints.push("避免连续高强度事件，给玩家喘息空间");
    if (p.progress <= 20) pacingHints.push("推进主线进度");
    if (pacingHints.length > 0) {
      lines.push(`- 节奏指引: ${pacingHints.join("；")}`);
    }
  }

  // Key events (agenda items with injection hints)
  if (delta.world_events_to_schedule && delta.world_events_to_schedule.length > 0 && !isDegraded) {
    const activeEvents = delta.world_events_to_schedule
      .filter((e) => e.injection_hint)
      .slice(0, 3);
    if (activeEvents.length > 0) {
      lines.push("- 关键事件:");
      for (const event of activeEvents) {
        lines.push(`  - ${event.title}: ${event.injection_hint}`);
      }
    }
  }

  // NPC actions (high priority only)
  if (delta.npc_next_actions && delta.npc_next_actions.length > 0 && !isDegraded) {
    const highPriority = delta.npc_next_actions.filter(
      (a) => a.urgency === "high"
    );
    if (highPriority.length > 0) {
      lines.push("- NPC 关键行动:");
      for (const action of highPriority.slice(0, 3)) {
        lines.push(`  - ${action.npc_code}: ${action.action}`);
      }
    }
  }

  // Prohibitions (agency constraints from agenda items)
  if (!isDegraded) {
    const constraints = delta.world_events_to_schedule
      ?.flatMap((e) => e.forbidden_outcomes ?? [])
      .filter(Boolean)
      .slice(0, 5);
    if (constraints && constraints.length > 0) {
      lines.push("- 禁止:");
      for (const c of constraints) {
        lines.push(`  - ${c}`);
      }
    }
  }

  // Closing: always include the autonomy reminder
  lines.push("");
  lines.push(
    "注意：以上为方向指引，具体的对话内容、场景描写、NPC 反应由你根据"
  );
  lines.push("当前游戏状态和人物性格自行创作。不要逐字复制指引内容。");

  return lines.join("\n");
}

/**
 * Build a simplified hint block for degraded plan confidence.
 * Only includes the most critical directional info.
 */
export function buildDegradedDirectorHint(
  structuredDelta: WorldEngineStructuredDelta | null
): string {
  if (!structuredDelta) return "";

  const lines: string[] = [];
  lines.push("## 导演方向指引（简化）");
  lines.push("");

  if (structuredDelta.current_phase) {
    lines.push(`- 当前阶段: ${structuredDelta.current_phase}`);
  }
  if (structuredDelta.director_intent) {
    lines.push(`- 大致方向: "${structuredDelta.director_intent}"`);
  }

  lines.push("");
  lines.push("注意：当前导演计划置信度较低，以上仅为大致方向参考。");
  lines.push("具体内容由你根据游戏状态自主创作。");

  return lines.join("\n");
}
