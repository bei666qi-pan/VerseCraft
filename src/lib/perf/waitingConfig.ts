/**
 * Waiting / latency related constants.
 *
 * 本模块的目标是把“等待体验/超时/节奏”相关常量收敛到单一入口，便于：
 * - 统一复用（避免多处散落、难以追踪）
 * - 后续用 feature/perf flags 做小步实验（本阶段不改变任何行为）
 *
 * 约束：
 * - 不改变 SSE 基本契约
 * - 不改变现有默认行为（数值保持与历史实现一致）
 */
export const VC_WAITING = {
  /**
   * Play page: Max wait for the first byte / response headers from our own `/api/chat`.
   * 现值来自 `src/app/play/page.tsx`，用于覆盖“服务端首字前重链路 + 上游重试”最坏情况。
   */
  // Phase-5：服务端已改为“尽早建立 SSE 通道并写 status frames”，不应再让客户端在 headers 上无意义等数分钟。
  // 仍给足够空间覆盖本地安全/DB 抖动与偶发慢请求，但避免误把卡死当正常。
  playFetchChatResponseDeadlineMs:
    process.env.NEXT_PUBLIC_VC_TIGHT_TIMEOUTS === "0" ? 280_000 : 90_000,

  /**
   * Play page: Max idle time between SSE chunks AFTER the first non-empty payload.
   * 现值来自 `src/app/play/page.tsx`，用于避免无限 “正在生成…”。
   */
  // Phase-5：减少“首字后长时间无响应”的无意义等待。
  playStreamChunkStallMs:
    process.env.NEXT_PUBLIC_VC_TIGHT_TIMEOUTS === "0" ? 120_000 : 70_000,

  /**
   * Play page: Stricter timeout until first non-empty `data:` payload.
   * 现值来自 `src/app/play/page.tsx`，用于区分“连接已建立但没有正文 bytes”。
   */
  // Phase-5：首个 data:（含 status frame）应当很快到达；过久则提示并收敛体验。
  playStreamFirstChunkStallMs:
    process.env.NEXT_PUBLIC_VC_TIGHT_TIMEOUTS === "0" ? 45_000 : 18_000,

  /**
   * Play page: per-request client deadline for `/api/chat` options_regen_only.
   * Keep this above the server options-only AI call floor (15s), otherwise the
   * browser can abort before a reasoning model emits the JSON options payload.
   */
  playOptionsOnlyClientDeadlineMs:
    process.env.NEXT_PUBLIC_VC_TIGHT_TIMEOUTS === "0" ? 45_000 : 20_000,

  /**
   * Opening fallback carries a colder context and often runs on first load.
   */
  playOpeningOptionsOnlyClientDeadlineMs:
    process.env.NEXT_PUBLIC_VC_TIGHT_TIMEOUTS === "0" ? 60_000 : 24_000,

  /**
   * Waiting UX: timer tick frequency for `usePlayWaitUx`.
   * 现值来自 `src/hooks/usePlayWaitUx.ts`。
   */
  playWaitUxTickMs: 160,

  /**
   * Waiting UX: show semantic subline only after some stable delay.
   * 现值来自 `src/hooks/usePlayWaitUx.ts`。
   */
  playWaitUxSemanticSublineAfterMs: 2200,

  /**
   * Server options-only fallback: request timeout for online short JSON tasks.
   * 现值来自 `src/lib/ai/logicalTasks.ts`（两次尝试均为 9s）。
   *
   * 注意：这不是主 PLAYER_CHAT 的超时；只用于 options/decision 的补救链路。
   */
  optionsOnlyFallbackRequestTimeoutMs: 9_000,

  /**
   * Phase-2: options/decision fallback 的“更快失败”策略（减少额外等待）。
   * - 首次尝试更短：尽快拿到可用 JSON 或进入下一档策略
   * - 二次尝试稍长：给模型一点纠错空间，但避免把“补救链”拖成主链路
   *
   * 为什么不会破坏玩法：
   * - 两次均失败会返回失败；UI 清空选项并提示重试/手动输入，不用模板冒充模型选项
   * - 主叙事 PLAYER_CHAT 不受影响
   */
  optionsOnlyFallbackAttempt1TimeoutMs: 6_500,
  optionsOnlyFallbackAttempt2TimeoutMs: 8_500,
} as const;

/**
 * Feature/perf flags hook points for future phases.
 *
 * 本阶段只提供“明确挂点”，不在生产逻辑中启用，不改变行为。
 * 建议后续阶段：
 * - client: NEXT_PUBLIC_VC_PERF_* 只影响展示层（等待文案/平滑策略/首屏反馈）
 * - server: AI_CHAT_PERF_* 只影响预算/并发/fastpath（需严格灰度）
 */
export const VC_PERF_FLAGS = {
  /** Enable extra client-side perf logging (no behavior changes). */
  clientPerfDebug: process.env.NEXT_PUBLIC_VC_PERF_DEBUG === "1",
  /** Use wait UX timeline V2 (backend stage + client signals). */
  clientWaitUxTimelineV2: process.env.NEXT_PUBLIC_VC_WAIT_UX_V2 !== "0",
  /** Use smooth stream pacing V2 (semantic chunks + tuned pauses). */
  clientSmoothStreamV2: process.env.NEXT_PUBLIC_VC_SMOOTH_STREAM_V2 !== "0",
  /** Apply tighter stall/headers timeouts. */
  clientTightTimeouts: process.env.NEXT_PUBLIC_VC_TIGHT_TIMEOUTS !== "0",
  /** Opening: prefer fast options-only fallback instead of repeating full opening request. */
  clientOpeningFastFallback: process.env.NEXT_PUBLIC_VC_OPENING_FAST_FALLBACK !== "0",
  /** options_regen_only: add hard deadline + early parse. */
  clientOptionsOnlyDeadline: process.env.NEXT_PUBLIC_VC_OPTIONS_ONLY_DEADLINE !== "0",
  /** Auto options regen on mode switch: limit frequency. */
  clientModeSwitchCooldown: process.env.NEXT_PUBLIC_VC_MODE_SWITCH_COOLDOWN !== "0",
} as const;

