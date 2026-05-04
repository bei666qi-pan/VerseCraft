/**
 * Shared waiting UX and chat latency budgets.
 *
 * Keep user-visible waiting thresholds, server repair deadlines, and benchmark
 * assertions here so `/play`, `/api/chat`, E2E, and scripts do not drift.
 */

export type ChatLatencyBudget = {
  /** Local UI should acknowledge a submitted action within this window. */
  immediateFeedbackMs: number;
  /** p95 for the first believable user feedback: local status, status frame, or visible text. */
  firstPerceivedFeedbackP95Ms: number;
  /** p95 for the first server status frame in `/api/chat` SSE. */
  firstStatusShownP95Ms: number;
  /** Normal live gateway p50 for first visible streamed text / first non-control token. */
  firstVisibleTextP50Ms: number;
  /** Normal live gateway p95 for first visible streamed text / first non-control token. */
  firstVisibleTextP95Ms: number;
  /** Normal turn p50 from submit to `__VERSECRAFT_FINAL__`. */
  normalTurnFinalP50Ms: number;
  /** Normal turn p95 from submit to `__VERSECRAFT_FINAL__`. */
  normalTurnFinalP95Ms: number;
  /** The player must not experience a completely blank/no-feedback wait beyond this. */
  maxNoFeedbackGapMs: number;
  /** Gap between visible stream chunks that should be counted as a warning. */
  maxInterChunkGapWarnMs: number;
  /** Degraded/no-key SSE should still emit the first status frame quickly. */
  degradedFirstStatusMaxMs: number;
  /** Degraded/no-key SSE should close with a parseable final frame quickly. */
  degradedFinalFrameMaxMs: number;
  /** A normal `/api/chat` turn should emit at least this many status frames. */
  minStatusFramesPerTurn: number;
};

export const CHAT_LATENCY_BUDGET: ChatLatencyBudget = {
  immediateFeedbackMs: 300,
  firstPerceivedFeedbackP95Ms: 800,
  firstStatusShownP95Ms: 800,
  firstVisibleTextP50Ms: 2_500,
  firstVisibleTextP95Ms: 5_000,
  normalTurnFinalP50Ms: 12_000,
  normalTurnFinalP95Ms: 20_000,
  maxNoFeedbackGapMs: 5_000,
  maxInterChunkGapWarnMs: 2_500,
  degradedFirstStatusMaxMs: 800,
  degradedFinalFrameMaxMs: 5_000,
  minStatusFramesPerTurn: 1,
} as const;

export const VC_WAITING = {
  /**
   * Play page: max wait for response headers from our own `/api/chat`.
   * This is intentionally wider than the budget because it is a hard abort,
   * not the target UX. Budget assertions live in `CHAT_LATENCY_BUDGET`.
   */
  playFetchChatResponseDeadlineMs:
    process.env.NEXT_PUBLIC_VC_TIGHT_TIMEOUTS === "0" ? 280_000 : 90_000,

  /**
   * Play page: max idle time between SSE chunks after the first non-empty payload.
   * A warning-level gap is much shorter: `CHAT_LATENCY_BUDGET.maxInterChunkGapWarnMs`.
   */
  playStreamChunkStallMs:
    process.env.NEXT_PUBLIC_VC_TIGHT_TIMEOUTS === "0" ? 120_000 : 70_000,

  /**
   * Play page: stricter timeout until the first non-empty `data:` payload
   * including status frames.
   */
  playStreamFirstChunkStallMs:
    process.env.NEXT_PUBLIC_VC_TIGHT_TIMEOUTS === "0" ? 45_000 : 18_000,

  /**
   * Play page: per-request client deadline for `/api/chat` options_regen_only.
   * Keep above the server options-only repair budget so the browser does not
   * abort before the bounded server repair chain finishes.
   */
  playOptionsOnlyClientDeadlineMs:
    process.env.NEXT_PUBLIC_VC_TIGHT_TIMEOUTS === "0" ? 45_000 : 20_000,

  /** Opening fallback carries a colder context and often runs on first load. */
  playOpeningOptionsOnlyClientDeadlineMs:
    process.env.NEXT_PUBLIC_VC_TIGHT_TIMEOUTS === "0" ? 60_000 : 24_000,

  /** Waiting UX timer tick for `usePlayWaitUx`. */
  playWaitUxTickMs: 160,

  /**
   * Waiting UX stage timing. These drive only client copy/progress, never the
   * server SSE contract or DM JSON commit path.
   */
  playWaitUxRoutingAfterMs: 800,
  playWaitUxContextAfterMs: 2_200,
  playWaitUxGeneratingAfterMs: CHAT_LATENCY_BUDGET.maxNoFeedbackGapMs,
  playWaitUxLongFeedbackAfterMs: CHAT_LATENCY_BUDGET.maxNoFeedbackGapMs,
  playWaitUxVeryLongFeedbackAfterMs: 10_000,
  playWaitUxSemanticSublineAfterMs: 2_200,

  /**
   * Client perf: a gap this large between visible SSE data events counts as a
   * long mid-stream pause. Additive analytics only.
   */
  playInterChunkLongGapMs: CHAT_LATENCY_BUDGET.maxInterChunkGapWarnMs,

  /**
   * Options/decision-only short JSON repair calls. These are not the main
   * PLAYER_CHAT narrative stream and must stay bounded.
   */
  optionsOnlyFallbackRequestTimeoutMs: 9_000,
  optionsOnlyFallbackAttempt1TimeoutMs: 6_500,
  optionsOnlyFallbackAttempt2TimeoutMs: 8_500,

  /**
   * Server wall-clock budget for the full options/decision repair chain.
   * This keeps repair attempts bounded without touching the main stream.
   */
  optionsOnlyServerBudgetMs: 16_000,

  /**
   * Server wall-clock budget for optional post-resolve narrative expansion.
   * This is not the main narrative generation path; if it cannot finish inside
   * this budget, keep the model's original narrative and preserve final latency.
   */
  narrativeExpansionServerBudgetMs: 2_000,

  /**
   * Server wall-clock budget for control preflight before the main PLAYER_CHAT
   * stream. A budget miss degrades to "preflight unavailable" and lets the
   * main model plus post-generation guards continue the turn. Set
   * AI_CONTROL_PREFLIGHT_BUDGET_MS=0 to roll back to the legacy wait.
   */
  controlPreflightDefaultBudgetMs: 260,
  controlPreflightBudgetCapMs: 260,
  loreRetrievalBudgetCapMs: 220,

  /**
   * Wall-clock budget for stream-body repair after the main PLAYER_CHAT stream
   * returns empty or breaks before meaningful content. A miss must fall back
   * cleanly instead of starting a second role stream that pushes first-visible
   * text past the live latency budget. Set AI_PLAYER_CHAT_STREAM_RECONNECT_WALL_MS
   * to override or AI_PLAYER_CHAT_TIMEOUTS_V2=0 to restore the legacy behavior.
   */
  playerChatStreamReconnectWallDefaultMs: 3_500,
} as const;

export const VC_PERF_FLAGS = {
  /** Enable extra client-side perf logging without changing behavior. */
  clientPerfDebug: process.env.NEXT_PUBLIC_VC_PERF_DEBUG === "1",
  /** Use wait UX timeline V2: backend stage + client signals. */
  clientWaitUxTimelineV2: process.env.NEXT_PUBLIC_VC_WAIT_UX_V2 !== "0",
  /** Use smooth stream pacing V2: semantic chunks + tuned pauses. */
  clientSmoothStreamV2: process.env.NEXT_PUBLIC_VC_SMOOTH_STREAM_V2 !== "0",
  /** Apply tighter stall/header hard timeouts. */
  clientTightTimeouts: process.env.NEXT_PUBLIC_VC_TIGHT_TIMEOUTS !== "0",
  /** Opening: prefer fast options-only fallback instead of repeating full opening request. */
  clientOpeningFastFallback: process.env.NEXT_PUBLIC_VC_OPENING_FAST_FALLBACK !== "0",
  /** options_regen_only: add hard deadline + early parse. */
  clientOptionsOnlyDeadline: process.env.NEXT_PUBLIC_VC_OPTIONS_ONLY_DEADLINE !== "0",
  /** Auto options regen on mode switch: limit frequency. */
  clientModeSwitchCooldown: process.env.NEXT_PUBLIC_VC_MODE_SWITCH_COOLDOWN !== "0",
} as const;
