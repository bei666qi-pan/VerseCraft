import type { GameStateSnapshot } from "@/lib/evals/playthrough/types";

const TARGET_TURN_MODE = "decision_required";
const TARGET_OPTIONS_LENGTH = 4;
const MAX_OPTION_CHARS = 30;

type DmRecordLike = Record<string, unknown>;

export type TurnModePlayerState = Pick<GameStateSnapshot, "playerLocation" | "inventoryItemIds"> & {
  activeTaskIds?: readonly string[];
  aliveNpcIds?: readonly string[];
};

export type TurnModeToolInterceptorInput = {
  record: DmRecordLike;
  playerContext?: string | null;
  narrative?: string;
  requestId?: string;
  playerState?: TurnModePlayerState | null;
};

export type TurnModeToolInterceptorResult = {
  record: DmRecordLike;
  correctedTurnMode: boolean;
  correctedOptionsLength: boolean;
  appendedOptionsCount: number;
  flags: string[];
  /** Backward-compatible telemetry field; deterministic completion never calls a model. */
  llmRefillUsed: false;
};

function coerceStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .map((entry) => entry.trim());
}

function clampOption(option: string): string {
  return option.length > MAX_OPTION_CHARS ? `${option.slice(0, MAX_OPTION_CHARS - 1)}…` : option;
}

function extractNarrativeAnchor(narrative: string | undefined): string | null {
  const trimmed = narrative?.trim();
  if (!trimmed) return null;
  const sentence = trimmed
    .split(/[。！？!?\n]/)
    .filter((entry) => entry.trim().length > 0)
    .pop()
    ?.trim()
    .slice(0, 24);
  return sentence || null;
}

function buildAnchorFallbackOptions(input: TurnModeToolInterceptorInput): string[] {
  const anchor = extractNarrativeAnchor(input.narrative);
  const location =
    input.playerState?.playerLocation ??
    (typeof input.playerContext === "string"
      ? input.playerContext.match(/位置[:：]\s*([^；;,，]+)/)?.[1] ?? null
      : null);
  const hasTask = (input.playerState?.activeTaskIds?.length ?? 0) > 0;
  const inventoryHasPhone = (input.playerState?.inventoryItemIds ?? []).includes("item_phone");
  const candidates = [
    anchor ? clampOption(`接着观察${anchor}`) : null,
    location ? clampOption(`在${location}仔细听动静`) : "停下脚步仔细听动静",
    hasTask ? "检查当前任务线索" : "清点随身物品与线索",
    inventoryHasPhone ? "掏出手机查看时间信号" : "记录眼前的线索与异常",
  ].filter((entry): entry is string => Boolean(entry));

  const options = [...new Set(candidates)].slice(0, TARGET_OPTIONS_LENGTH);
  for (const option of [
    "继续观察当前场景",
    "停在原地谨慎判断",
    "沿来路检查可见痕迹",
    "继续当前行动方向",
  ]) {
    if (options.length >= TARGET_OPTIONS_LENGTH) break;
    if (!options.includes(option)) options.push(option);
  }
  return options;
}

/**
 * Normalizes a provider candidate to the four-choice turn contract without an
 * additional AI invocation. It uses only candidate prose and structured player
 * state, so it cannot create authoritative facts or side effects.
 */
export async function enforceToolCallShape(
  input: TurnModeToolInterceptorInput,
): Promise<TurnModeToolInterceptorResult> {
  const flags: string[] = [];
  const record: DmRecordLike = { ...input.record };
  const originalTurnMode = typeof record.turn_mode === "string" ? record.turn_mode : null;
  const originalDecisionRequired =
    typeof record.decision_required === "boolean" ? record.decision_required : null;
  const originalOptions = coerceStringArray(record.options);
  const originalDecisionOptions = coerceStringArray(record.decision_options);
  const workingOptions = originalOptions.slice(0, TARGET_OPTIONS_LENGTH).map(clampOption);

  let appendedOptionsCount = 0;
  const correctedOptionsLength = originalOptions.length !== TARGET_OPTIONS_LENGTH;
  if (correctedOptionsLength) {
    for (const option of originalDecisionOptions) {
      if (workingOptions.length >= TARGET_OPTIONS_LENGTH) break;
      const clamped = clampOption(option);
      if (!workingOptions.includes(clamped)) workingOptions.push(clamped);
    }
    if (workingOptions.length < TARGET_OPTIONS_LENGTH) {
      flags.push("options_refilled_by_template_fallback");
      const before = workingOptions.length;
      for (const option of buildAnchorFallbackOptions(input)) {
        if (workingOptions.length >= TARGET_OPTIONS_LENGTH) break;
        if (!workingOptions.includes(option)) workingOptions.push(option);
      }
      appendedOptionsCount = workingOptions.length - before;
    }
    if (originalOptions.length > TARGET_OPTIONS_LENGTH) {
      flags.push(`options_truncated_from_${originalOptions.length}`);
    }
    record.options = workingOptions;
  }

  const correctedTurnMode =
    originalTurnMode !== TARGET_TURN_MODE || originalDecisionRequired !== true;
  if (correctedTurnMode) {
    record.turn_mode = TARGET_TURN_MODE;
    record.decision_required = true;
    flags.push(
      originalTurnMode === "narrative_only"
        ? "turn_mode_corrected_from_narrative_only"
        : "turn_mode_corrected_from_missing",
    );
    if (appendedOptionsCount > 0) flags.push(`options_appended_${appendedOptionsCount}`);
  }
  if (correctedTurnMode && workingOptions.length > 0) {
    record.decision_options = [...workingOptions];
  }

  if (flags.length > 0) {
    const existingFlags = coerceStringArray(record._commit_flags);
    record._commit_flags = [...new Set([...existingFlags, ...flags])];
    const existingMeta =
      record.internal_meta && typeof record.internal_meta === "object" && !Array.isArray(record.internal_meta)
        ? (record.internal_meta as DmRecordLike)
        : {};
    record.internal_meta = {
      ...existingMeta,
      hitl_turn_mode_interceptor: "applied_v2",
      hitl_corrections: flags.join(","),
      hitl_llm_refill_used: false,
      ...(input.requestId ? { hitl_request_id: input.requestId } : {}),
    };
  }

  return {
    record,
    correctedTurnMode,
    correctedOptionsLength,
    appendedOptionsCount,
    flags,
    llmRefillUsed: false,
  };
}

export function buildAnchorFallbackOptionsForTest(input: TurnModeToolInterceptorInput): string[] {
  return buildAnchorFallbackOptions(input);
}
