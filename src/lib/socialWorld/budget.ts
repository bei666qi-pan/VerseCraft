import type { SocialWorldBudget } from "@/lib/socialWorld/types";

export const DEFAULT_SOCIAL_WORLD_BUDGET: SocialWorldBudget = Object.freeze({
  maxTrackedNpc: 20,
  defaultActiveNpcPerTick: 5,
  maxActiveNpcPerTick: 7,
  maxSocialEventsPerTick: 3,
  maxVisibleSocialEventsPerTurn: 2,
  maxSocialPromptChars: 420,
  maxCharsPerSocialEvent: 90,
});

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  const safe = Number.isFinite(numeric) ? Math.trunc(numeric) : fallback;
  return Math.max(min, Math.min(max, safe));
}

export function normalizeSocialWorldBudget(raw?: Partial<SocialWorldBudget> | null): SocialWorldBudget {
  const maxTrackedNpc = clampInt(raw?.maxTrackedNpc, 1, 20, DEFAULT_SOCIAL_WORLD_BUDGET.maxTrackedNpc);
  const maxActiveNpcPerTick = clampInt(
    raw?.maxActiveNpcPerTick,
    1,
    7,
    DEFAULT_SOCIAL_WORLD_BUDGET.maxActiveNpcPerTick
  );
  const defaultActiveNpcPerTick = clampInt(
    raw?.defaultActiveNpcPerTick,
    1,
    maxActiveNpcPerTick,
    DEFAULT_SOCIAL_WORLD_BUDGET.defaultActiveNpcPerTick
  );

  return {
    maxTrackedNpc,
    defaultActiveNpcPerTick,
    maxActiveNpcPerTick,
    maxSocialEventsPerTick: clampInt(
      raw?.maxSocialEventsPerTick,
      1,
      6,
      DEFAULT_SOCIAL_WORLD_BUDGET.maxSocialEventsPerTick
    ),
    maxVisibleSocialEventsPerTurn: clampInt(
      raw?.maxVisibleSocialEventsPerTurn,
      0,
      4,
      DEFAULT_SOCIAL_WORLD_BUDGET.maxVisibleSocialEventsPerTurn
    ),
    maxSocialPromptChars: clampInt(
      raw?.maxSocialPromptChars,
      120,
      1200,
      DEFAULT_SOCIAL_WORLD_BUDGET.maxSocialPromptChars
    ),
    maxCharsPerSocialEvent: clampInt(
      raw?.maxCharsPerSocialEvent,
      30,
      180,
      DEFAULT_SOCIAL_WORLD_BUDGET.maxCharsPerSocialEvent
    ),
  };
}
