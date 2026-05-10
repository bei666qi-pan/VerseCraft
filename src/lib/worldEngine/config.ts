import { envBoolean, envEnum, envNumber } from "@/lib/config/envRaw";

export type WorldDirectorMode = "off" | "shadow" | "soft";

export type WorldDirectorConfig = {
  enabled: boolean;
  mode: WorldDirectorMode;
  hintInjectionEnabled: boolean;
  criticEnabled: boolean;
  maxDueHints: number;
  minTriggerGapTurns: number;
  maxPendingAgendaPerSession: number;
  defaultAgendaTtlTurns: number;
  agendaQueryTimeoutMs: number;
};

export function resolveWorldDirectorConfig(): WorldDirectorConfig {
  // 默认 soft：让 reasoner 异步导演链路（worldEngine tick + agenda hint 注入）实质生效。
  // 仍可由部署侧通过 AI_DIRECTOR_MODE / AI_ENABLE_DIRECTOR_HINT_INJECTION 显式覆盖。
  const mode = envEnum("AI_DIRECTOR_MODE", ["off", "shadow", "soft"] as const, "soft");
  const enabled = envBoolean("AI_ENABLE_WORLD_DIRECTOR", true) && mode !== "off";
  return {
    enabled,
    mode,
    hintInjectionEnabled:
      enabled && mode === "soft" && envBoolean("AI_ENABLE_DIRECTOR_HINT_INJECTION", true),
    criticEnabled: enabled && envBoolean("AI_ENABLE_DIRECTOR_CRITIC", false),
    maxDueHints: Math.max(1, Math.min(3, envNumber("AI_DIRECTOR_MAX_DUE_HINTS", 2))),
    minTriggerGapTurns: Math.max(0, Math.min(48, envNumber("AI_DIRECTOR_MIN_TRIGGER_GAP_TURNS", 4))),
    maxPendingAgendaPerSession: Math.max(
      1,
      Math.min(50, envNumber("AI_DIRECTOR_MAX_PENDING_AGENDA_PER_SESSION", 12))
    ),
    defaultAgendaTtlTurns: Math.max(
      1,
      Math.min(48, envNumber("AI_DIRECTOR_AGENDA_DEFAULT_TTL_TURNS", 6))
    ),
    agendaQueryTimeoutMs: Math.max(
      10,
      Math.min(500, envNumber("AI_DIRECTOR_AGENDA_QUERY_TIMEOUT_MS", 80))
    ),
  };
}
