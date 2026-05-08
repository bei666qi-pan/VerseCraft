import { envRaw } from "@/lib/config/envRaw";
import { DEFAULT_SOCIAL_WORLD_BUDGET, normalizeSocialWorldBudget } from "@/lib/socialWorld/budget";
import type { SocialWorldBudget } from "@/lib/socialWorld/types";

export type SocialWorldMode = "off" | "shadow" | "soft";

export type SocialWorldConfig = {
  enabled: boolean;
  mode: SocialWorldMode;
  backgroundEnabled: boolean;
  promptInjectionEnabled: boolean;
  maxActiveNpcs: number;
  maxEventsPerTick: number;
  maxPromptEvents: number;
  promptMaxChars: number;
  queryTimeoutMs: number;
  minTriggerGapTurns: number;
  maxPendingEventsPerSession: number;
  budget: SocialWorldBudget;
};

type EnvSource = Partial<Record<string, string | undefined>>;

function raw(name: string, source?: EnvSource): string | undefined {
  return source ? source[name] : envRaw(name);
}

function boolEnv(name: string, fallback: boolean, source?: EnvSource): boolean {
  const value = raw(name, source);
  if (!value) return fallback;
  const lower = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(lower)) return true;
  if (["0", "false", "no", "off"].includes(lower)) return false;
  return fallback;
}

function numberEnv(name: string, fallback: number, source?: EnvSource): number {
  const value = raw(name, source);
  if (!value) return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function modeEnv(source: EnvSource | undefined, fallback: SocialWorldMode): SocialWorldMode {
  const value = raw("AI_SOCIAL_WORLD_MODE", source)?.trim().toLowerCase();
  if (value === "off" || value === "shadow" || value === "soft") return value;
  return fallback;
}

function clampInt(value: number, min: number, max: number): number {
  const safe = Number.isFinite(value) ? Math.trunc(value) : min;
  return Math.max(min, Math.min(max, safe));
}

export function resolveSocialWorldConfig(source?: EnvSource): SocialWorldConfig {
  const featureEnabled = boolEnv("AI_ENABLE_SOCIAL_WORLD", false, source);
  const requestedMode = modeEnv(source, featureEnabled ? "shadow" : "off");
  const enabled = featureEnabled && requestedMode !== "off";
  const mode: SocialWorldMode = enabled ? requestedMode : "off";
  const maxActiveNpcs = clampInt(
    numberEnv("AI_SOCIAL_MAX_ACTIVE_NPCS", DEFAULT_SOCIAL_WORLD_BUDGET.defaultActiveNpcPerTick, source),
    1,
    DEFAULT_SOCIAL_WORLD_BUDGET.maxActiveNpcPerTick
  );
  const maxEventsPerTick = clampInt(
    numberEnv("AI_SOCIAL_MAX_EVENTS_PER_TICK", DEFAULT_SOCIAL_WORLD_BUDGET.maxSocialEventsPerTick, source),
    1,
    DEFAULT_SOCIAL_WORLD_BUDGET.maxSocialEventsPerTick
  );
  const maxPromptEvents = clampInt(
    numberEnv("AI_SOCIAL_MAX_PROMPT_EVENTS", DEFAULT_SOCIAL_WORLD_BUDGET.maxVisibleSocialEventsPerTurn, source),
    0,
    DEFAULT_SOCIAL_WORLD_BUDGET.maxVisibleSocialEventsPerTurn
  );
  const promptMaxChars = clampInt(
    numberEnv("AI_SOCIAL_PROMPT_MAX_CHARS", DEFAULT_SOCIAL_WORLD_BUDGET.maxSocialPromptChars, source),
    120,
    DEFAULT_SOCIAL_WORLD_BUDGET.maxSocialPromptChars
  );
  const queryTimeoutMs = clampInt(numberEnv("AI_SOCIAL_QUERY_TIMEOUT_MS", 80, source), 10, 150);
  const minTriggerGapTurns = clampInt(numberEnv("AI_SOCIAL_MIN_TRIGGER_GAP_TURNS", 4, source), 0, 48);
  const maxPendingEventsPerSession = clampInt(
    numberEnv("AI_SOCIAL_MAX_PENDING_EVENTS_PER_SESSION", maxEventsPerTick * 4, source),
    maxEventsPerTick,
    30
  );
  const budget = normalizeSocialWorldBudget({
    maxTrackedNpc: DEFAULT_SOCIAL_WORLD_BUDGET.maxTrackedNpc,
    defaultActiveNpcPerTick: maxActiveNpcs,
    maxActiveNpcPerTick: maxActiveNpcs,
    maxSocialEventsPerTick: maxEventsPerTick,
    maxVisibleSocialEventsPerTurn: maxPromptEvents,
    maxSocialPromptChars: promptMaxChars,
    maxCharsPerSocialEvent: DEFAULT_SOCIAL_WORLD_BUDGET.maxCharsPerSocialEvent,
  });

  return {
    enabled,
    mode,
    backgroundEnabled: enabled && (mode === "shadow" || mode === "soft"),
    promptInjectionEnabled: enabled && mode === "soft",
    maxActiveNpcs,
    maxEventsPerTick,
    maxPromptEvents,
    promptMaxChars,
    queryTimeoutMs,
    minTriggerGapTurns,
    maxPendingEventsPerSession,
    budget,
  };
}
