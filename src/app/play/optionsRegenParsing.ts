import { extractRegenOptionsFromRaw, tryParseDM } from "@/features/play/stream/dmParse";
import {
  extractFinalPayloadFromSseDocument,
  extractStatusFrameFromSseEvent,
  foldSseTextToDmRaw,
  normalizeSseNewlines,
  takeCompleteSseEvents,
} from "@/features/play/stream/sseFrame";
import { pickTurnOptionsFromResolvedDm } from "@/features/play/turnCommit/pickDecisionOptions";
import type { OptionsRegenReasonCode } from "@/lib/play/optionsRegenObservability";

export const OPTIONS_REGEN_FAILURE_HINT = "也可以直接写下下一步行动。";

const KNOWN_REGEN_REASON_CODES = new Set<OptionsRegenReasonCode>([
  "parse_failed",
  "duplicated_rejected",
  "anchor_miss_rejected",
  "generic_rejected",
  "homogeneity_rejected",
  "repair_pass_used",
]);

export type OptionsRegenFailureDiagnostic = {
  kind: "server_rejected" | "parse_failed" | "semantic_rejected";
  reason: string;
  debugReasonCodes: string[];
  requestId: string | null;
  rawLength: number;
  extractedOptionsCount: number;
  normalizedOptionsCount: number;
  semanticGateRejectReason: string | null;
};

export type OptionsRegenParseResult = {
  options: string[];
  parseFailed: boolean;
  rejectCodes: OptionsRegenReasonCode[];
  requestId: string | null;
  rawLength: number;
  extractedOptionsCount: number;
  normalizedOptionsCount: number;
  semanticGateRejectReason: string | null;
  failure: OptionsRegenFailureDiagnostic | null;
};

export type OptionsRegenParseConfig = {
  requestId?: string | null;
  extraBlocked?: string[];
  normalizeOptions: (rawOptions: unknown) => string[];
  runSemanticQualityGate: (
    candidateOptions: string[],
    extraBlocked?: string[]
  ) => { accepted: string[]; rejectCodes: OptionsRegenReasonCode[] };
  tryParseDm?: (raw: string) => unknown;
};

function safeStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim());
}

function toKnownReasonCodes(codes: string[]): OptionsRegenReasonCode[] {
  return codes.filter((x): x is OptionsRegenReasonCode => KNOWN_REGEN_REASON_CODES.has(x as OptionsRegenReasonCode));
}

function asOptionsArray(obj: Record<string, unknown>): unknown[] {
  if (Array.isArray(obj.decision_options)) return obj.decision_options;
  if (Array.isArray(obj.options)) return obj.options;
  return [];
}

function isOptionsRegenResponse(obj: Record<string, unknown>): boolean {
  return (
    typeof obj.ok === "boolean" &&
    (Object.prototype.hasOwnProperty.call(obj, "reason") ||
      Object.prototype.hasOwnProperty.call(obj, "options") ||
      Object.prototype.hasOwnProperty.call(obj, "decision_options") ||
      Object.prototype.hasOwnProperty.call(obj, "debug_reason_codes"))
  );
}

function requestIdFromObject(obj: Record<string, unknown>): string | null {
  const requestId = obj.requestId ?? obj.request_id;
  return typeof requestId === "string" && requestId.trim() ? requestId.trim().slice(0, 96) : null;
}

function requestIdFromSseDocument(sseDocument: string): string | null {
  let buf = normalizeSseNewlines(sseDocument);
  while (true) {
    const { events, rest } = takeCompleteSseEvents(buf);
    buf = rest;
    for (const eventText of events) {
      const status = extractStatusFrameFromSseEvent(eventText);
      if (typeof status?.requestId === "string" && status.requestId.trim()) return status.requestId.trim();
    }
    if (events.length === 0) break;
  }
  const orphan = buf.trim();
  if (orphan.startsWith("data:")) {
    const status = extractStatusFrameFromSseEvent(orphan);
    if (typeof status?.requestId === "string" && status.requestId.trim()) return status.requestId.trim();
  }
  return null;
}

function semanticRejectReason(codes: OptionsRegenReasonCode[]): string | null {
  return codes.length > 0 ? Array.from(new Set(codes)).join(",") : null;
}

function buildFailure(args: {
  kind: OptionsRegenFailureDiagnostic["kind"];
  reason: string;
  debugReasonCodes: string[];
  requestId: string | null;
  rawLength: number;
  extractedOptionsCount: number;
  normalizedOptionsCount: number;
  semanticGateRejectReason: string | null;
}): OptionsRegenFailureDiagnostic {
  return {
    kind: args.kind,
    reason: args.reason || "unknown",
    debugReasonCodes: args.debugReasonCodes.slice(0, 12),
    requestId: args.requestId,
    rawLength: args.rawLength,
    extractedOptionsCount: args.extractedOptionsCount,
    normalizedOptionsCount: args.normalizedOptionsCount,
    semanticGateRejectReason: args.semanticGateRejectReason,
  };
}

function applyOptionsQuality(
  rawOptions: unknown,
  extraBlocked: string[] | undefined,
  config: OptionsRegenParseConfig
): {
  accepted: string[];
  normalizedCount: number;
  rejectCodes: OptionsRegenReasonCode[];
  semanticGateRejectReason: string | null;
} {
  const normalized = config.normalizeOptions(rawOptions);
  const quality = config.runSemanticQualityGate(normalized, extraBlocked ?? []);
  return {
    accepted: quality.accepted,
    normalizedCount: normalized.length,
    rejectCodes: quality.rejectCodes,
    semanticGateRejectReason: semanticRejectReason(quality.rejectCodes),
  };
}

export function parseOptionsFromSsePayload(payloadText: string, config: OptionsRegenParseConfig): OptionsRegenParseResult {
  const finalPayload = extractFinalPayloadFromSseDocument(payloadText);
  const dmRaw = (finalPayload.found ? finalPayload.payload : foldSseTextToDmRaw(payloadText)).trim();
  const rawLength = dmRaw.length;
  const statusRequestId = requestIdFromSseDocument(payloadText);
  const baseRequestId = config.requestId ?? statusRequestId ?? null;

  if (!dmRaw) {
    const failure = buildFailure({
      kind: "parse_failed",
      reason: "empty_payload",
      debugReasonCodes: ["empty_payload"],
      requestId: baseRequestId,
      rawLength,
      extractedOptionsCount: 0,
      normalizedOptionsCount: 0,
      semanticGateRejectReason: null,
    });
    return {
      options: [],
      parseFailed: true,
      rejectCodes: ["parse_failed"],
      requestId: baseRequestId,
      rawLength,
      extractedOptionsCount: 0,
      normalizedOptionsCount: 0,
      semanticGateRejectReason: null,
      failure,
    };
  }

  try {
    const directParsed = JSON.parse(dmRaw) as Record<string, unknown>;
    if (directParsed && typeof directParsed === "object" && !Array.isArray(directParsed)) {
      const requestId = requestIdFromObject(directParsed) ?? baseRequestId;
      const debugReasonCodes = safeStringArray(directParsed.debug_reason_codes);
      const serverRejectCodes = toKnownReasonCodes(debugReasonCodes);
      const directOptions = asOptionsArray(directParsed);
      const extractedOptionsCount = directOptions.length;

      if (isOptionsRegenResponse(directParsed)) {
        const quality = applyOptionsQuality(directOptions, config.extraBlocked, config);
        const rejectCodes = [...serverRejectCodes, ...quality.rejectCodes];
        const reason = typeof directParsed.reason === "string" ? directParsed.reason : "unknown";
        if (directParsed.ok === false) {
          const failure = buildFailure({
            kind: "server_rejected",
            reason,
            debugReasonCodes,
            requestId,
            rawLength,
            extractedOptionsCount,
            normalizedOptionsCount: quality.normalizedCount,
            semanticGateRejectReason: quality.semanticGateRejectReason,
          });
          return {
            options: [],
            parseFailed: true,
            rejectCodes,
            requestId,
            rawLength,
            extractedOptionsCount,
            normalizedOptionsCount: quality.normalizedCount,
            semanticGateRejectReason: quality.semanticGateRejectReason,
            failure,
          };
        }

        const failure =
          quality.accepted.length > 0
            ? null
            : buildFailure({
                kind: quality.normalizedCount > 0 ? "semantic_rejected" : "server_rejected",
                reason: reason === "ok" ? "insufficient_options" : reason,
                debugReasonCodes,
                requestId,
                rawLength,
                extractedOptionsCount,
                normalizedOptionsCount: quality.normalizedCount,
                semanticGateRejectReason: quality.semanticGateRejectReason,
              });
        return {
          options: quality.accepted,
          parseFailed: quality.accepted.length === 0,
          rejectCodes,
          requestId,
          rawLength,
          extractedOptionsCount,
          normalizedOptionsCount: quality.normalizedCount,
          semanticGateRejectReason: quality.semanticGateRejectReason,
          failure,
        };
      }

      if (extractedOptionsCount > 0) {
        const quality = applyOptionsQuality(directOptions, config.extraBlocked, config);
        return {
          options: quality.accepted,
          parseFailed: false,
          rejectCodes: [...serverRejectCodes, ...quality.rejectCodes],
          requestId,
          rawLength,
          extractedOptionsCount,
          normalizedOptionsCount: quality.normalizedCount,
          semanticGateRejectReason: quality.semanticGateRejectReason,
          failure: quality.accepted.length > 0
            ? null
            : buildFailure({
                kind: "semantic_rejected",
                reason: "semantic_gate_rejected",
                debugReasonCodes,
                requestId,
                rawLength,
                extractedOptionsCount,
                normalizedOptionsCount: quality.normalizedCount,
                semanticGateRejectReason: quality.semanticGateRejectReason,
              }),
        };
      }
    }
  } catch {
    // Fall through to the full DM parser for legacy mixed narrative/JSON payloads.
  }

  const parseDm = config.tryParseDm ?? tryParseDM;
  const parsed = parseDm(dmRaw);
  const picked = pickTurnOptionsFromResolvedDm(parsed);
  let rawOptions: unknown = picked.options;
  let extractedOptionsCount = Array.isArray(rawOptions) ? rawOptions.length : 0;
  let parseFailed = false;
  if (!Array.isArray(rawOptions) || rawOptions.length === 0) {
    const loose = extractRegenOptionsFromRaw(dmRaw);
    if (loose && loose.length > 0) {
      rawOptions = loose;
      extractedOptionsCount = loose.length;
    } else {
      parseFailed = true;
    }
  }
  const quality = applyOptionsQuality(rawOptions, config.extraBlocked, config);
  const failure =
    parseFailed && quality.accepted.length === 0
      ? buildFailure({
          kind: "parse_failed",
          reason: "parse_failed",
          debugReasonCodes: ["parse_failed"],
          requestId: baseRequestId,
          rawLength,
          extractedOptionsCount,
          normalizedOptionsCount: quality.normalizedCount,
          semanticGateRejectReason: quality.semanticGateRejectReason,
        })
      : null;
  return {
    options: quality.accepted,
    parseFailed,
    rejectCodes: quality.rejectCodes,
    requestId: baseRequestId,
    rawLength,
    extractedOptionsCount,
    normalizedOptionsCount: quality.normalizedCount,
    semanticGateRejectReason: quality.semanticGateRejectReason,
    failure,
  };
}
