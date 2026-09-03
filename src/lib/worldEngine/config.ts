import { envBoolean, envEnum, envNumber } from "@/lib/config/envRaw";

export type WorldDirectorMode = "off" | "shadow" | "soft";

export type WorldDirectorConfig = {
  enabled: boolean;
  mode: WorldDirectorMode;
  directiveInjectionEnabled: boolean;
  maxDueEvents: number;
  minTriggerGapTurns: number;
  maxPendingAgendaPerSession: number;
  defaultAgendaTtlTurns: number;
  eventQueryTimeoutMs: number;
};

export function resolveWorldDirectorConfig(): WorldDirectorConfig {
  // 默认 soft：异步 Director 维护唯一 agenda，Writer 即时投影 directive。
  const mode = envEnum("AI_DIRECTOR_MODE", ["off", "shadow", "soft"] as const, "soft");
  const enabled = envBoolean("AI_ENABLE_WORLD_DIRECTOR", true) && mode !== "off";
  return {
    enabled,
    mode,
    directiveInjectionEnabled:
      enabled && mode === "soft" && envBoolean("AI_ENABLE_DIRECTOR_DIRECTIVE", true),
    maxDueEvents: Math.max(1, Math.min(3, envNumber("AI_DIRECTOR_MAX_DUE_EVENTS", 2))),
    minTriggerGapTurns: Math.max(0, Math.min(48, envNumber("AI_DIRECTOR_MIN_TRIGGER_GAP_TURNS", 4))),
    maxPendingAgendaPerSession: Math.max(
      1,
      Math.min(50, envNumber("AI_DIRECTOR_MAX_PENDING_AGENDA_PER_SESSION", 12))
    ),
    defaultAgendaTtlTurns: Math.max(
      1,
      Math.min(48, envNumber("AI_DIRECTOR_AGENDA_DEFAULT_TTL_TURNS", 6))
    ),
    eventQueryTimeoutMs: Math.max(
      10,
      Math.min(500, envNumber("AI_DIRECTOR_EVENT_QUERY_TIMEOUT_MS", 80))
    ),
  };
}

export function resolveWorldCapabilityMode(worldId: "dark_moon_prologue" | "xingni_taichu"): WorldDirectorMode {
  return worldId === "xingni_taichu"
    ? envEnum("AI_DIRECTOR_XINGNI_MODE", ["off", "shadow", "soft"] as const, "soft")
    : envEnum("AI_DIRECTOR_DARK_MOON_MODE", ["off", "shadow", "soft"] as const, "soft");
}
