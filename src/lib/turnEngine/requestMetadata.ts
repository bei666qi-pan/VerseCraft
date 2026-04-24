import { derivePlatformFromUserAgent } from "@/lib/analytics/dateKeys";
import { isOpeningSystemUserMessage } from "@/features/play/opening/openingCopy";
import type { TurnRequestMetadata, ChatMessageShape, PlannedTurnMode, UpstreamErrorFields } from "@/lib/turnEngine/types";
import type { PlayerControlPlane } from "@/lib/playRealtime/types";
import { createRequestId, getClientIpFromHeaders } from "@/lib/security/helpers";
import {
  isSafeVerseCraftRequestId,
  VERSECRAFT_REQUEST_ID_HEADER,
} from "@/lib/telemetry/requestId";

const ENTITY_CODE_RE = /\b([NA]-\d{3})\b/gi;

export function buildTurnRequestMetadata(args: {
  headers: Headers;
  messages: ChatMessageShape[];
  requestStartedAt: number;
}): TurnRequestMetadata {
  const inboundRid = args.headers.get(VERSECRAFT_REQUEST_ID_HEADER);
  const requestId = isSafeVerseCraftRequestId(inboundRid) ? inboundRid : createRequestId("chat");
  const isFirstAction = !args.messages.some((message) => message.role === "assistant");
  const lastUserMessageTrimmed = (() => {
    for (let i = args.messages.length - 1; i >= 0; i--) {
      const message = args.messages[i];
      if (message?.role === "user" && typeof message.content === "string") {
        return message.content.trim();
      }
    }
    return "";
  })();

  return {
    clientIp: getClientIpFromHeaders(args.headers),
    requestId,
    platform: derivePlatformFromUserAgent(args.headers.get("user-agent")),
    requestStartedAt: args.requestStartedAt,
    isFirstAction,
    shouldApplyFirstActionConstraint: Boolean(
      isFirstAction && isOpeningSystemUserMessage(lastUserMessageTrimmed)
    ),
  };
}

export function buildMinimalPlayerContextSnapshot(playerContext: string): string {
  const src = String(playerContext ?? "");
  if (!src) return "";
  const picks: string[] = [];
  const patterns = [
    /用户位置\[[^\]]+\]/,
    /游戏时间\[[^\]]+\]/,
    /任务追踪：[^\n]+/,
    /NPC当前位置：[^\n]+/,
    /主威胁状态：[^\n]+/,
    /职业状态：[^\n]+/,
    /图鉴已解锁：[^\n]+/,
  ];
  for (const re of patterns) {
    const match = src.match(re);
    if (match?.[0]) picks.push(match[0]);
  }
  if (picks.length > 0) return picks.join("\n");
  return src.slice(0, 420);
}

export function parseUpstreamErrorFields(lastBodySnippet: string | undefined): UpstreamErrorFields {
  if (!lastBodySnippet?.trim()) return {};
  try {
    const parsed = JSON.parse(lastBodySnippet) as {
      error?: { message?: string; code?: string };
    };
    const message = parsed.error?.message?.trim();
    const code = parsed.error?.code?.trim();
    if (message || code) {
      return {
        ...(message ? { upstreamHint: message.slice(0, 500) } : {}),
        ...(code ? { upstreamCode: code.slice(0, 128) } : {}),
      };
    }
  } catch {
    // Fall back to a short raw snippet.
  }
  return { upstreamHint: lastBodySnippet.slice(0, 280) };
}

export function clampText(value: string, maxChars: number): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length <= maxChars ? text : text.slice(0, maxChars);
}

export function extractLastAssistantNarrativeTail(chatMsgs: ChatMessageShape[]): string | null {
  for (let i = chatMsgs.length - 1; i >= 0; i--) {
    const message = chatMsgs[i];
    if (!message || message.role !== "assistant") continue;
    const content = String(message.content ?? "");
    try {
      const parsed = JSON.parse(content) as { narrative?: unknown };
      const narrative = typeof parsed?.narrative === "string" ? parsed.narrative : "";
      const trimmed = narrative.replace(/\s+/g, " ").trim();
      if (trimmed) return trimmed.slice(Math.max(0, trimmed.length - 180));
    } catch {
      const trimmed = content.replace(/\s+/g, " ").trim();
      if (trimmed) return trimmed.slice(Math.max(0, trimmed.length - 180));
    }
  }
  return null;
}

export function extractRecentEntities(latestUserInput: string): string[] {
  const out = new Set<string>();
  for (const match of latestUserInput.matchAll(ENTITY_CODE_RE)) out.add(match[1].toUpperCase());
  return [...out];
}

function normalizeOptionText(value: string): string {
  return String(value ?? "")
    .replace(/[銆愩€慭[\]锛堬級()]/g, " ")
    .replace(/[锛?銆傦紒锛??:锛氾紱;銆佲€溾€?']/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function jaccardSimilarity(a: string, b: string): number {
  const ta = normalizeOptionText(a).split(" ").filter(Boolean);
  const tb = normalizeOptionText(b).split(" ").filter(Boolean);
  if (ta.length === 0 || tb.length === 0) return 0;
  const sa = new Set(ta);
  const sb = new Set(tb);
  let inter = 0;
  for (const token of sa) if (sb.has(token)) inter += 1;
  const union = sa.size + sb.size - inter;
  return union <= 0 ? 0 : inter / union;
}

export function dedupeDecisionOptions(raw: unknown, max = 4): string[] {
  const source = Array.isArray(raw) ? raw : [];
  const out: string[] = [];
  for (const item of source) {
    if (out.length >= max) break;
    if (typeof item !== "string") continue;
    const normalized = item.trim();
    if (!normalized || normalized.length < 2) continue;
    const duplicated = out.some((existing) => existing === normalized || jaccardSimilarity(existing, normalized) >= 0.82);
    if (duplicated) continue;
    out.push(normalized);
  }
  return out;
}

export function inferPlannedTurnMode(args: {
  latestUserInput: string;
  shouldApplyFirstActionConstraint: boolean;
  clientState: unknown;
  pipelineControl: PlayerControlPlane | null;
}): PlannedTurnMode {
  if (args.shouldApplyFirstActionConstraint) {
    return { mode: "decision_required", reason: "opening_first_action_constraint" };
  }
  const clientState = args.clientState as any;
  const day = Number(clientState?.time?.day ?? NaN);
  const hour = Number(clientState?.time?.hour ?? NaN);
  if (Number.isFinite(day) && Number.isFinite(hour) && day >= 10 && hour <= 0) {
    return {
      mode: "system_transition",
      reason: `time_endgame(day=${Math.trunc(day)},hour=${Math.trunc(hour)})`,
    };
  }
  const raw = String(args.latestUserInput ?? "").trim();
  if (raw.length <= 16 && /^(杩庢帴缁堢剦|杩涘叆缁撶畻|鏌ョ湅缁撶畻|澶嶆椿|纭澶嶆椿)$/.test(raw)) {
    return { mode: "system_transition", reason: "input_transition_command" };
  }
  const beat = typeof clientState?.directorDigest?.beatModeHint === "string" ? clientState.directorDigest.beatModeHint : "";
  const tension = Number(clientState?.directorDigest?.tension ?? NaN);
  const pendingIncCount = Array.isArray(clientState?.directorDigest?.pendingIncidentCodes)
    ? clientState.directorDigest.pendingIncidentCodes.length
    : 0;
  if (beat === "collision" || beat === "countdown" || beat === "peak") {
    return { mode: "decision_required", reason: `directorDigest.beat=${beat}` };
  }
  if (Number.isFinite(tension) && tension >= 85) {
    return { mode: "decision_required", reason: `directorDigest.tension=${Math.trunc(tension)}` };
  }
  if (pendingIncCount >= 2 && (beat === "pressure" || beat === "aftershock")) {
    return { mode: "decision_required", reason: `directorDigest.pending=${pendingIncCount}` };
  }
  void args.pipelineControl;
  return { mode: "narrative_only", reason: "default_narrative" };
}
