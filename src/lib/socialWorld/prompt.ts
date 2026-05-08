import { normalizeSocialWorldBudget } from "@/lib/socialWorld/budget";
import { projectSocialEventToPlayerProjection } from "@/lib/socialWorld/projection";
import type { SocialEvent, SocialWorldBudget } from "@/lib/socialWorld/types";

export type SocialWorldHintVisibilityCounts = {
  ambient: number;
  rumor: number;
  directly_observable: number;
};

export type SocialProjectionSkippedReason =
  | "none"
  | "disabled"
  | "no_session"
  | "no_due_events"
  | "all_filtered"
  | "budget_exhausted"
  | "query_failed"
  | "timeout";

export type SocialWorldHintBuildResult = {
  block: string;
  projectedEventIds: string[];
  socialHintCount: number;
  socialHintChars: number;
  socialHintVisibilityCounts: SocialWorldHintVisibilityCounts;
  socialProjectionSkippedReason: SocialProjectionSkippedReason;
  socialQueryLatencyMs: number;
};

export type LoadDueSocialEventsForPrompt = (
  sessionId: string,
  nowTurn: number,
  maxItems: number
) => Promise<readonly SocialEvent[]>;

const SOCIAL_HINT_TITLE = "## 【社会动态提示｜只供写作，不是玩家可见文本】";
const SOCIAL_HINT_CONSTRAINT = "不得直接解释后台原因；不得强制玩家失败；不得泄露隐藏真相。";
const SOCIAL_HINT_TIMEOUT = Symbol("social_hint_timeout");

function emptyResult(reason: SocialProjectionSkippedReason, socialQueryLatencyMs = 0): SocialWorldHintBuildResult {
  return {
    block: "",
    projectedEventIds: [],
    socialHintCount: 0,
    socialHintChars: 0,
    socialHintVisibilityCounts: { ambient: 0, rumor: 0, directly_observable: 0 },
    socialProjectionSkippedReason: reason,
    socialQueryLatencyMs,
  };
}

function formatHintItem(index: number, projection: ReturnType<typeof projectSocialEventToPlayerProjection>): string {
  if (!projection) return "";
  return [
    `${index}. event_code=${projection.eventCode}`,
    `   表达层级：${projection.visibility}`,
    `   可见痕迹：${projection.visibleTrace}`,
    `   约束：${SOCIAL_HINT_CONSTRAINT}`,
  ].join("\n");
}

function itemWithinBudget(lines: readonly string[], item: string, maxChars: number): boolean {
  if (!item) return false;
  return [...lines, item].join("\n").length <= maxChars;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | typeof SOCIAL_HINT_TIMEOUT> {
  if (timeoutMs <= 0) return promise;
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race<T | typeof SOCIAL_HINT_TIMEOUT>([
    promise,
    new Promise<typeof SOCIAL_HINT_TIMEOUT>((resolve) => {
      timer = setTimeout(() => resolve(SOCIAL_HINT_TIMEOUT), timeoutMs);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export function buildSocialWorldHintBlockWithMeta(
  events: readonly SocialEvent[],
  opts?: {
    budget?: Partial<SocialWorldBudget> | null;
    maxItems?: number;
    maxChars?: number;
  }
): SocialWorldHintBuildResult {
  const budget = normalizeSocialWorldBudget(opts?.budget);
  const maxChars = Math.max(0, Math.min(420, opts?.maxChars ?? budget.maxSocialPromptChars, budget.maxSocialPromptChars));
  const maxItems = Math.max(
    0,
    Math.min(2, opts?.maxItems ?? budget.maxVisibleSocialEventsPerTurn, budget.maxVisibleSocialEventsPerTurn)
  );
  if (events.length === 0) return emptyResult("no_due_events");
  if (maxItems <= 0) return emptyResult("disabled");
  if (SOCIAL_HINT_TITLE.length >= maxChars) return emptyResult("budget_exhausted");

  const lines: string[] = [SOCIAL_HINT_TITLE];
  const projectedEventIds: string[] = [];
  const visibilityCounts: SocialWorldHintVisibilityCounts = { ambient: 0, rumor: 0, directly_observable: 0 };
  let sawVisibleCandidate = false;
  let budgetExhausted = false;

  for (const event of events) {
    if (projectedEventIds.length >= maxItems) break;
    const projection = projectSocialEventToPlayerProjection(event, { budget });
    if (!projection) continue;
    sawVisibleCandidate = true;

    let item = formatHintItem(projectedEventIds.length + 1, projection);
    if (!itemWithinBudget(lines, item, maxChars)) {
      const smallerProjection = projectSocialEventToPlayerProjection(event, {
        budget,
        maxChars: Math.min(60, budget.maxCharsPerSocialEvent),
      });
      item = formatHintItem(projectedEventIds.length + 1, smallerProjection);
    }
    if (!itemWithinBudget(lines, item, maxChars)) {
      const compactProjection = projectSocialEventToPlayerProjection(event, {
        budget,
        maxChars: Math.min(42, budget.maxCharsPerSocialEvent),
      });
      item = formatHintItem(projectedEventIds.length + 1, compactProjection);
    }
    if (!itemWithinBudget(lines, item, maxChars)) {
      budgetExhausted = true;
      break;
    }

    lines.push(item);
    projectedEventIds.push(event.id);
    visibilityCounts[projection.visibility] += 1;
  }

  if (projectedEventIds.length === 0) {
    return emptyResult(budgetExhausted ? "budget_exhausted" : sawVisibleCandidate ? "budget_exhausted" : "all_filtered");
  }

  const block = lines.join("\n");
  return {
    block,
    projectedEventIds,
    socialHintCount: projectedEventIds.length,
    socialHintChars: block.length,
    socialHintVisibilityCounts: visibilityCounts,
    socialProjectionSkippedReason: budgetExhausted ? "budget_exhausted" : "none",
    socialQueryLatencyMs: 0,
  };
}

export function buildSocialWorldHintBlock(
  events: readonly SocialEvent[],
  opts?: {
    budget?: Partial<SocialWorldBudget> | null;
    maxItems?: number;
    maxChars?: number;
  }
): string {
  return buildSocialWorldHintBlockWithMeta(events, opts).block;
}

export async function loadSocialWorldHintForPrompt(args: {
  sessionId: string | null | undefined;
  nowTurn: number;
  loadDueSocialEventsForPrompt: LoadDueSocialEventsForPrompt;
  enabled?: boolean;
  timeoutMs?: number;
  budget?: Partial<SocialWorldBudget> | null;
}): Promise<SocialWorldHintBuildResult> {
  if (args.enabled === false) return emptyResult("disabled");
  const sessionId = typeof args.sessionId === "string" ? args.sessionId.trim() : "";
  if (!sessionId) return emptyResult("no_session");

  const budget = normalizeSocialWorldBudget(args.budget);
  const maxItems = budget.maxVisibleSocialEventsPerTurn;
  if (maxItems <= 0) return emptyResult("disabled");

  const startedAt = Date.now();
  try {
    const result = await withTimeout(
      args.loadDueSocialEventsForPrompt(sessionId, Math.max(0, Math.trunc(args.nowTurn || 0)), maxItems),
      Math.max(0, Math.trunc(args.timeoutMs ?? 80))
    );
    const latencyMs = Math.max(0, Date.now() - startedAt);
    if (result === SOCIAL_HINT_TIMEOUT) return emptyResult("timeout", latencyMs);
    return { ...buildSocialWorldHintBlockWithMeta([...result], { budget, maxItems }), socialQueryLatencyMs: latencyMs };
  } catch {
    return emptyResult("query_failed", Math.max(0, Date.now() - startedAt));
  }
}
