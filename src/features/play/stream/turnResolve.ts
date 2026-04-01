import type { DMJson } from "./types";
import { extractNarrative, tryParseDMDetailed } from "./dmParse";
import { extractFinalPayloadFromSseDocument } from "./sseFrame";
import { hasProtocolLeakSignature, sanitizeNarrativeLeakageForFinal } from "@/lib/playRealtime/protocolGuard";

export type TurnResolveFailureCategory =
  | "final_frame_missing"
  | "final_payload_invalid"
  | "raw_dm_parse_failed"
  | "protocol_guard_rejected";

export type TurnResolveSource = "final" | "raw" | "narrative_only" | "none";

export interface ResolveTurnInput {
  /** Full SSE document text accumulated during streaming. */
  sseDocumentText: string;
  /** Folded raw DM buffer accumulated from SSE events (legacy path). */
  rawDm: string;
}

export interface ResolveTurnResult {
  dm: DMJson | null;
  narrative: string;
  source: TurnResolveSource;
  failure: TurnResolveFailureCategory | null;
  debug: {
    finalFound: boolean;
    finalPayloadLen: number;
    rawLen: number;
  };
}

/**
 * Resolve the authoritative turn payload.
 *
 * Rules:
 * - Prefer server `__VERSECRAFT_FINAL__` frame for DM commit.
 * - Fall back to legacy raw fold only when final is missing or invalid.
 * - Never treat "parse failed" as "narrative must be dropped" — salvage narrative if possible.
 */
export function resolveTurnFromSse(input: ResolveTurnInput): ResolveTurnResult {
  const rawDm = input.rawDm ?? "";
  const finalExtract = extractFinalPayloadFromSseDocument(input.sseDocumentText ?? "");

  let failure: TurnResolveFailureCategory | null = null;
  let dm: DMJson | null = null;
  let source: TurnResolveSource = "none";
  let finalParseFailed: TurnResolveFailureCategory | null = null;

  if (finalExtract.found) {
    const finalParsed = tryParseDMDetailed(finalExtract.payload);
    if (finalParsed.dm) {
      dm = finalParsed.dm;
      source = "final";
    } else if (finalParsed.reason === "protocol_guard_rejected") {
      failure = "protocol_guard_rejected";
      finalParseFailed = "protocol_guard_rejected";
    } else {
      failure = "final_payload_invalid";
      finalParseFailed = "final_payload_invalid";
    }
  } else {
    failure = "final_frame_missing";
  }

  if (!dm) {
    const rawParsed = tryParseDMDetailed(rawDm);
    if (rawParsed.dm) {
      dm = rawParsed.dm;
      source = "raw";
      // Keep the "why final wasn't used" classification when raw succeeds.
      failure = finalParseFailed ?? null;
    } else if (rawParsed.reason === "protocol_guard_rejected") {
      failure = "protocol_guard_rejected";
    } else if (!failure) {
      failure = "raw_dm_parse_failed";
    } else if (failure === "final_frame_missing") {
      // Prefer a more specific category when both are bad.
      failure = "raw_dm_parse_failed";
    }
  }

  const narrative = (() => {
    if (dm?.narrative) return String(dm.narrative);
    const fromRaw = extractNarrative(rawDm);
    const fromFinal = extractNarrative(finalExtract.payload ?? "");
    // 选择更可能“完整”的那一份正文（通常更长）；避免 final 无效但 raw 有效时丢正文。
    const picked = (fromRaw.trim().length >= fromFinal.trim().length ? fromRaw : fromFinal).trim();
    if (!picked) return "";
    // narrative salvage 仍必须 fail-closed：不允许协议污染穿透到日志/状态层。
    const sanitized = sanitizeNarrativeLeakageForFinal(picked);
    // degraded=true 时 sanitize 会给出统一安全提示文本；此处保留该文本，避免“正文全空”造成回退感。
    if (sanitized.degraded) return sanitized.narrative;
    if (hasProtocolLeakSignature(sanitized.narrative)) {
      const blocked = sanitizeNarrativeLeakageForFinal(`（协议污染）${sanitized.narrative}`);
      return blocked.narrative;
    }
    return sanitized.narrative;
  })();
  if (narrative && !dm) {
    source = "narrative_only";
  }

  return {
    dm,
    narrative,
    source,
    failure,
    debug: {
      finalFound: finalExtract.found,
      finalPayloadLen: (finalExtract.payload ?? "").length,
      rawLen: rawDm.length,
    },
  };
}

