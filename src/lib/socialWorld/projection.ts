import { normalizeSocialWorldBudget } from "@/lib/socialWorld/budget";
import { normalizeSocialEvent } from "@/lib/socialWorld/state";
import type { SocialEvent, SocialVisibility, SocialWorldBudget } from "@/lib/socialWorld/types";

export type SocialPromptVisibility = Extract<SocialVisibility, "ambient" | "rumor" | "directly_observable">;

export type SocialEventPlayerProjection = {
  eventCode: string;
  visibility: SocialPromptVisibility;
  visibleTrace: string;
};

const GLOBAL_FORBIDDEN_MARKERS = [
  "player_private_hooks",
  "player_private_hook",
  "private hook",
  "private hooks",
  "dmOnly",
  "DM-only",
  "DM only",
  "dm only",
  "后台私有 hook",
  "后台私有hooks",
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function stripMustNotRevealText(text: string, forbidden: readonly string[]): string {
  let out = text;
  for (const item of forbidden) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    out = out.replace(new RegExp(escapeRegExp(trimmed), "gi"), "");
  }
  return out.replace(/\s+/g, " ").trim();
}

function containsForbiddenText(text: string, forbidden: readonly string[]): boolean {
  const lower = text.toLowerCase();
  return forbidden.some((item) => {
    const trimmed = item.trim();
    return Boolean(trimmed) && lower.includes(trimmed.toLowerCase());
  });
}

function clampText(text: string, max: number): string {
  const clean = text.trim().replace(/\s+/g, " ");
  if (!clean) return "";
  return clean.length <= max ? clean : clean.slice(0, max);
}

function safeLocation(event: SocialEvent, forbidden: readonly string[]): string {
  const location = stripMustNotRevealText(event.locationId || "", forbidden);
  return location && !containsForbiddenText(location, forbidden) ? location : "附近";
}

function fallbackSummary(event: SocialEvent, forbidden: readonly string[]): string {
  const location = safeLocation(event, forbidden);
  switch (event.type) {
    case "rumor_spread":
      return `${location}有人交换了未证实的说法。`;
    case "conflict":
      return `${location}留下了争执后的痕迹。`;
    case "trade":
      return `${location}出现了短暂交换留下的细节。`;
    case "alliance":
      return `${location}有两股立场短暂靠近。`;
    case "betrayal":
      return `${location}像是有某种信任被悄悄破坏。`;
    case "warning":
      return `${location}出现了克制的提醒痕迹。`;
    case "rescue":
      return `${location}有被人匆忙帮过的迹象。`;
    case "surveillance":
      return `${location}有被暗中观察过的感觉。`;
    case "debt_call":
      return `${location}有人提起旧账。`;
    case "secret_transfer":
      return `${location}留下了物件被转交过的迹象。`;
    case "route_interference":
      return `${location}某条路线像是被人动过手脚。`;
    case "conversation":
    default:
      return `${location}残留了低声交谈后的气氛。`;
  }
}

function visibilityPrefix(visibility: SocialPromptVisibility): string {
  if (visibility === "ambient") return "环境痕迹：";
  if (visibility === "rumor") return "传闻（未证实）：";
  return "当前场景可见：";
}

function buildSafeTrace(
  event: SocialEvent,
  visibility: SocialPromptVisibility,
  forbidden: readonly string[],
  maxChars: number
): string {
  const rawBase = event.summaryForPlayer || fallbackSummary(event, forbidden);
  const cleanedBase = stripMustNotRevealText(rawBase, forbidden);
  const fallback = stripMustNotRevealText(fallbackSummary(event, forbidden), forbidden);
  const base =
    cleanedBase && !containsForbiddenText(cleanedBase, forbidden)
      ? cleanedBase
      : fallback && !containsForbiddenText(fallback, forbidden)
        ? fallback
        : "只保留一个模糊、可忽略的现场变化。";
  const trace = clampText(`${visibilityPrefix(visibility)}${base}`, maxChars);
  return containsForbiddenText(trace, forbidden) ? "" : trace;
}

export function projectSocialEventToPlayerProjection(
  rawEvent: SocialEvent | unknown,
  opts?: {
    budget?: Partial<SocialWorldBudget> | null;
    maxChars?: number;
    mustNotReveal?: readonly string[];
  }
): SocialEventPlayerProjection | null {
  const event = normalizeSocialEvent(rawEvent);
  if (event.visibility === "private" || event.knowledgeScope === "dmOnly") return null;

  const budget = normalizeSocialWorldBudget(opts?.budget);
  const maxChars = Math.max(30, Math.min(opts?.maxChars ?? budget.maxCharsPerSocialEvent, budget.maxCharsPerSocialEvent));
  const visibility = event.visibility as SocialPromptVisibility;
  const forbidden = [...GLOBAL_FORBIDDEN_MARKERS, ...event.mustNotReveal, ...(opts?.mustNotReveal ?? [])];
  const visibleTrace = buildSafeTrace(event, visibility, forbidden, maxChars);
  if (!visibleTrace) return null;
  const cleanedEventCode = stripMustNotRevealText(event.id || "social_event_unknown", forbidden);
  const eventCode =
    cleanedEventCode && !containsForbiddenText(cleanedEventCode, forbidden) ? cleanedEventCode : "social_event_redacted";

  return {
    eventCode: clampText(eventCode, 48) || "social_event_redacted",
    visibility,
    visibleTrace,
  };
}

export function projectSocialEventToPlayerHint(
  rawEvent: SocialEvent | unknown,
  opts?: {
    budget?: Partial<SocialWorldBudget> | null;
    maxChars?: number;
    mustNotReveal?: readonly string[];
  }
): string | null {
  return projectSocialEventToPlayerProjection(rawEvent, opts)?.visibleTrace ?? null;
}
