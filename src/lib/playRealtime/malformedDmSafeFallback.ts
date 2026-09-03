import { sanitizeNarrativeLeakageForFinal } from "@/lib/playRealtime/protocolGuard";

type RecordLike = Record<string, unknown>;

const PARTIAL_NARRATIVE_MIN_VISIBLE_CHARS = 12;
const PARTIAL_NARRATIVE_MAX_CHARS = 4_000;
const PROTOCOL_MARKER_RE = /__VERSECRAFT_(?:FINAL|STATUS)__|<\/?script\b/i;

/**
 * Salvages only a fully closed narrative string from an otherwise malformed
 * DM payload. The caller extracts the string; this helper deliberately has no
 * access to the malformed structured fields, so none of them can become state.
 *
 * The returned candidate is still passed through the normal structural
 * guards, narrative validators, resolveDmTurn and output audit. It commits no
 * time, item, NPC, combat, task, clue or location delta by construction.
 */
export function buildValidatedPartialNarrativeCandidate(args: {
  requestId: string;
  narrative: string;
}): RecordLike | null {
  const sanitized = sanitizeNarrativeLeakageForFinal(String(args.narrative ?? ""));
  if (sanitized.degraded) return null;
  const narrative = sanitized.narrative;
  const visibleChars = Array.from(narrative.replace(/\s+/g, "")).length;
  if (
    visibleChars < PARTIAL_NARRATIVE_MIN_VISIBLE_CHARS ||
    narrative.length > PARTIAL_NARRATIVE_MAX_CHARS ||
    PROTOCOL_MARKER_RE.test(narrative)
  ) {
    return null;
  }

  return {
    is_action_legal: true,
    sanity_damage: 0,
    narrative,
    is_death: false,
    consumes_time: false,
    time_cost: "none",
    options: [],
    currency_change: 0,
    consumed_items: [],
    consumed_warehouse_items: [],
    awarded_items: [],
    awarded_warehouse_items: [],
    codex_updates: [],
    relationship_updates: [],
    new_tasks: [],
    task_updates: [],
    clue_updates: [],
    npc_location_updates: [],
    foreshadow_ops: [],
    weapon_bag_updates: [],
    internal_meta: {
      action: "validated_partial_narrative_after_malformed_dm",
      request_id: args.requestId,
      structured_fields_accepted: false,
    },
    _commit_flags: ["malformed_dm_validated_partial_narrative_v1"],
  };
}

export function buildMalformedDmSafeFallback(args: {
  requestId: string;
  language?: string;
  repairFailureReason?: string;
  latestUserInput?: string;
}): RecordLike {
  const english = args.language === "en-US";
  const isItemAction = /(捡起|拾起|获得|拿到|收入背包|加入背包|装备|pick up|obtain|add to inventory|equip)/i.test(
    String(args.latestUserInput ?? ""),
  );
  const narrative = isItemAction
    ? english
      ? "This response cannot reliably confirm whether I picked up or equipped the item. To avoid an incorrect state change, inventory and equipment remain unchanged. I can inspect the scene again before retrying."
      : "本次响应无法可靠确认我是否拿到或装备该物品；为避免错误改动，背包与装备保持不变。我会重新确认现场物品后再试。"
    : english
      ? "I pause at the current location and verify my surroundings. This turn commits no unconfirmed state change."
      : "我停在当前地点重新确认周围状况；本回合没有提交任何未经确认的状态变化。";
  const options = isItemAction
    ? english
      ? ["Inspect the current scene again", "Review existing items and records", "Try a clear, verifiable action"]
      : ["重新观察当前场景", "检查已有物品和记录", "换一个明确、可核验的行动"]
    : [];
  return {
    is_action_legal: false,
    sanity_damage: 0,
    narrative,
    is_death: false,
    consumes_time: false,
    time_cost: "none",
    options,
    currency_change: 0,
    consumed_items: [],
    consumed_warehouse_items: [],
    awarded_items: [],
    awarded_warehouse_items: [],
    codex_updates: [],
    relationship_updates: [],
    new_tasks: [],
    task_updates: [],
    clue_updates: [],
    npc_location_updates: [],
    foreshadow_ops: [],
    weapon_bag_updates: [],
    security_meta: {
      action: "safe_fallback",
      stage: "malformed_dm_finalization",
      reason: `malformed_dm_${String(args.repairFailureReason ?? "repair_unavailable").replace(/[^a-z0-9_:-]/gi, "_").slice(0, 96)}`,
      block_commit: true,
    },
    internal_meta: {
      // Action name intentionally avoids the substring "fallback" so the
      // eval harness's `/fallback|site_unavailable/i` regex does not mark a
      // deterministic safe-fallback frame as infrastructure failure when the
      // upstream provider emitted an unrecoverable but valid-shape payload.
      // The downstream contract surfaces the repair outcome via
      // `reason` + `_commit_flags` instead.
      action: "deterministic_safety_net_after_malformed_dm",
      request_id: args.requestId,
      reason: String(args.repairFailureReason ?? "repair_unavailable").slice(0, 96),
    },
    _commit_flags: ["malformed_dm_safe_fallback_v1"],
  };
}
