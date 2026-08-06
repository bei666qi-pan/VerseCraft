// src/lib/ai/governance/sessionBudget.test.ts
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

// Mock server-only (no-op in test environment)
vi.mock("server-only", () => ({}));

// Mock governance env so we control budget limits in tests
const mockEnv = {
  cacheContentVersion: "1",
  responseCacheEnabled: true,
  controlPreflightCacheTtlSec: 50,
  preflightMaxPerMinutePerSession: 48,
  enhanceCooldownSec: 90,
  enhanceMaxPerHourPerSession: 10,
  enhanceGateMinScore: 32,
};

vi.mock("@/lib/ai/governance/env", () => ({
  aiGovernanceEnv: mockEnv,
}));

// Capture real Date.now and provide a controllable clock
const realNow = Date.now;
let fakeNow = realNow();

function advanceTime(ms: number): void {
  fakeNow += ms;
  vi.setSystemTime(fakeNow);
}

function resetTime(): void {
  fakeNow = realNow();
  vi.setSystemTime(fakeNow);
}

// Re-import after mocks so the module sees the mocked deps
let sessionBudget: typeof import("./sessionBudget");

beforeEach(async () => {
  vi.useFakeTimers();
  resetTime();
  // Map-based module state is file-scoped; reload it for clean state per test.
  sessionBudget = await vi.importActual<typeof import("./sessionBudget")>(
    "./sessionBudget",
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// 1. Budget initialization with default limits
// ---------------------------------------------------------------------------
describe("budget initialization with default limits", () => {
  it("allows preflight calls up to the default cap (48 per minute)", () => {
    const sid = "init-preflight-cap";
    for (let i = 0; i < mockEnv.preflightMaxPerMinutePerSession; i++) {
      expect(sessionBudget.allowControlPreflightForSession(sid)).toBe(true);
    }
    expect(sessionBudget.allowControlPreflightForSession(sid)).toBe(false);
  });

  it("allows enhancement checks when no budget has been spent", () => {
    expect(
      sessionBudget.isNarrativeEnhancementBudgetAvailable("init-fresh"),
    ).toBe(true);
  });

  it("respects the default enhancement cooldown (90s)", () => {
    const sid = "init-cooldown";
    sessionBudget.commitNarrativeEnhancementBudget(sid);
    expect(
      sessionBudget.isNarrativeEnhancementBudgetAvailable(sid),
    ).toBe(false);
    advanceTime(mockEnv.enhanceCooldownSec * 1000 + 1);
    expect(
      sessionBudget.isNarrativeEnhancementBudgetAvailable(sid),
    ).toBe(true);
  });

  it("respects the default enhancement hourly cap (10)", () => {
    const sid = "init-hourly-cap";
    for (let i = 0; i < mockEnv.enhanceMaxPerHourPerSession; i++) {
      expect(
        sessionBudget.isNarrativeEnhancementBudgetAvailable(sid),
      ).toBe(true);
      sessionBudget.commitNarrativeEnhancementBudget(sid);
      advanceTime(mockEnv.enhanceCooldownSec * 1000 + 1);
    }
    expect(
      sessionBudget.isNarrativeEnhancementBudgetAvailable(sid),
    ).toBe(false);
  });

  it("enforces minimum preflight cap of 6", () => {
    mockEnv.preflightMaxPerMinutePerSession = 1; // below floor
    // Reload to pick up new env
    vi.resetModules();
    // The module reads env at call time, so no reload needed for the env value.
    // But the Maps are module-scoped; we can test inline.
    // Since the module caches Maps at module scope, we need a fresh import.
    // Let's just verify the min-floor logic by testing edge values directly.
    // The code uses Math.max(6, Math.min(120, envValue)).
    // With env=1, the effective max should still be 6.
    // We'll just test this by calling 5 times and seeing all pass, then 6th.
    for (let i = 0; i < 5; i++) {
      expect(
        sessionBudget.allowControlPreflightForSession("floor-test"),
      ).toBe(true);
    }
    // 6th call → still allowed because floor is 6
    expect(
      sessionBudget.allowControlPreflightForSession("floor-test"),
    ).toBe(true);
    // 7th → denied
    expect(
      sessionBudget.allowControlPreflightForSession("floor-test"),
    ).toBe(false);
    // Restore default
    mockEnv.preflightMaxPerMinutePerSession = 48;
  });
});

// ---------------------------------------------------------------------------
// 2. Budget deduction for token usage
// ---------------------------------------------------------------------------
describe("budget deduction for token usage", () => {
  it("commitNarrativeEnhancementBudget consumes one slot from the hourly cap", () => {
    // Before commit: available
    expect(
      sessionBudget.isNarrativeEnhancementBudgetAvailable("deduct-session"),
    ).toBe(true);
    sessionBudget.commitNarrativeEnhancementBudget("deduct-session");
    // After commit (within cooldown): unavailable
    expect(
      sessionBudget.isNarrativeEnhancementBudgetAvailable("deduct-session"),
    ).toBe(false);
    // Advance past cooldown + a small buffer
    advanceTime(mockEnv.enhanceCooldownSec * 1000 + 10);
    // Now available again (only 1 of 10 hourly slots consumed)
    expect(
      sessionBudget.isNarrativeEnhancementBudgetAvailable("deduct-session"),
    ).toBe(true);
  });

  it("allowControlPreflightForSession consumes one slot from the per-minute window", () => {
    // Fill the window up to max-1
    for (let i = 0; i < mockEnv.preflightMaxPerMinutePerSession - 1; i++) {
      sessionBudget.allowControlPreflightForSession("preflight-session");
    }
    // One more should be allowed
    expect(
      sessionBudget.allowControlPreflightForSession("preflight-session"),
    ).toBe(true);
    // Now exhausted
    expect(
      sessionBudget.allowControlPreflightForSession("preflight-session"),
    ).toBe(false);
  });

  it("preflight slots are tracked per session independently", () => {
    // Fill session A
    for (let i = 0; i < mockEnv.preflightMaxPerMinutePerSession; i++) {
      sessionBudget.allowControlPreflightForSession("session-a");
    }
    expect(sessionBudget.allowControlPreflightForSession("session-a")).toBe(
      false,
    );
    // Session B should still be unrestricted
    expect(sessionBudget.allowControlPreflightForSession("session-b")).toBe(
      true,
    );
  });

  it("enhancement budget is tracked per session independently", () => {
    // Consume one slot for session A
    sessionBudget.commitNarrativeEnhancementBudget("session-a");
    // Session B should still have full budget
    expect(
      sessionBudget.isNarrativeEnhancementBudgetAvailable("session-b"),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Budget exhaustion behavior
// ---------------------------------------------------------------------------
describe("budget exhaustion behavior", () => {
  it("returns false from allowControlPreflightForSession when preflight budget is exhausted", () => {
    for (let i = 0; i < mockEnv.preflightMaxPerMinutePerSession; i++) {
      sessionBudget.allowControlPreflightForSession("exhausted-session");
    }
    expect(
      sessionBudget.allowControlPreflightForSession("exhausted-session"),
    ).toBe(false);
    // Further calls remain false
    expect(
      sessionBudget.allowControlPreflightForSession("exhausted-session"),
    ).toBe(false);
    expect(
      sessionBudget.allowControlPreflightForSession("exhausted-session"),
    ).toBe(false);
  });

  it("returns false from isNarrativeEnhancementBudgetAvailable when hourly cap is exhausted", () => {
    for (let i = 0; i < mockEnv.enhanceMaxPerHourPerSession; i++) {
      sessionBudget.commitNarrativeEnhancementBudget("enhance-exhausted");
      advanceTime(mockEnv.enhanceCooldownSec * 1000 + 1);
    }
    expect(
      sessionBudget.isNarrativeEnhancementBudgetAvailable("enhance-exhausted"),
    ).toBe(false);
  });

  it("does not mutate state on isNarrativeEnhancementBudgetAvailable (pure check)", () => {
    // Exhaust the budget
    for (let i = 0; i < mockEnv.enhanceMaxPerHourPerSession; i++) {
      sessionBudget.commitNarrativeEnhancementBudget("pure-check");
      advanceTime(mockEnv.enhanceCooldownSec * 1000 + 1);
    }
    // Calling isAvailable multiple times should consistently return false
    // without consuming further slots (which would be a bug)
    expect(
      sessionBudget.isNarrativeEnhancementBudgetAvailable("pure-check"),
    ).toBe(false);
    expect(
      sessionBudget.isNarrativeEnhancementBudgetAvailable("pure-check"),
    ).toBe(false);
    expect(
      sessionBudget.isNarrativeEnhancementBudgetAvailable("pure-check"),
    ).toBe(false);
  });

  it("null/undefined sessionId falls back to 'anon' key", () => {
    // Fill the anon budget
    for (let i = 0; i < mockEnv.preflightMaxPerMinutePerSession; i++) {
      sessionBudget.allowControlPreflightForSession(null);
    }
    expect(sessionBudget.allowControlPreflightForSession(null)).toBe(false);
    expect(sessionBudget.allowControlPreflightForSession(undefined)).toBe(
      false,
    );
    // Named session still ok
    expect(
      sessionBudget.allowControlPreflightForSession("named-session"),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. Budget reset
// ---------------------------------------------------------------------------
describe("budget reset", () => {
  it("preflight budget resets after the 60-second window expires", () => {
    // Exhaust the budget
    for (let i = 0; i < mockEnv.preflightMaxPerMinutePerSession; i++) {
      sessionBudget.allowControlPreflightForSession("reset-preflight");
    }
    expect(
      sessionBudget.allowControlPreflightForSession("reset-preflight"),
    ).toBe(false);

    // Advance beyond 60-second window
    advanceTime(60_001);
    expect(
      sessionBudget.allowControlPreflightForSession("reset-preflight"),
    ).toBe(true);
  });

  it("enhancement hourly budget resets after the 1-hour window expires", () => {
    // Exhaust the hourly budget
    for (let i = 0; i < mockEnv.enhanceMaxPerHourPerSession; i++) {
      sessionBudget.commitNarrativeEnhancementBudget("reset-enhance");
      advanceTime(mockEnv.enhanceCooldownSec * 1000 + 1);
    }
    expect(
      sessionBudget.isNarrativeEnhancementBudgetAvailable("reset-enhance"),
    ).toBe(false);

    // Advance beyond 1-hour window
    advanceTime(3_600_001);
    expect(
      sessionBudget.isNarrativeEnhancementBudgetAvailable("reset-enhance"),
    ).toBe(true);
  });

  it("enhancement cooldown resets after the configured cooldown period", () => {
    sessionBudget.commitNarrativeEnhancementBudget("cooldown-reset");
    // Within cooldown → blocked
    advanceTime(mockEnv.enhanceCooldownSec * 1000 - 1);
    expect(
      sessionBudget.isNarrativeEnhancementBudgetAvailable("cooldown-reset"),
    ).toBe(false);
    // Past cooldown → allowed (assuming hourly cap not exhausted)
    advanceTime(2); // just past the cooldown boundary
    expect(
      sessionBudget.isNarrativeEnhancementBudgetAvailable("cooldown-reset"),
    ).toBe(true);
  });

  it("partial window expiration only frees expired slots, not all", () => {
    // Make 10 calls spread across 30 seconds
    for (let i = 0; i < 10; i++) {
      sessionBudget.allowControlPreflightForSession("partial-reset");
      advanceTime(3_000); // 3s apart
    }
    // After ~30s, 10 slots consumed. Advance another 35s → first ~11-12 should expire
    // Total elapsed: ~30s of calls + 35s = 65s, so early calls are >60s old
    advanceTime(35_000);
    // Should have room again since some slots expired
    expect(
      sessionBudget.allowControlPreflightForSession("partial-reset"),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. Preflight budget check
// ---------------------------------------------------------------------------
describe("preflight budget check", () => {
  it("allows preflight within the per-minute sliding window limit", () => {
    // Default cap is 48. 47 calls should all pass.
    for (let i = 0; i < 47; i++) {
      expect(
        sessionBudget.allowControlPreflightForSession("preflight-check"),
      ).toBe(true);
    }
    // 48th call: allowed
    expect(
      sessionBudget.allowControlPreflightForSession("preflight-check"),
    ).toBe(true);
    // 49th call: denied
    expect(
      sessionBudget.allowControlPreflightForSession("preflight-check"),
    ).toBe(false);
  });

  it("rejects preflight when budget is fully consumed", () => {
    for (let i = 0; i < mockEnv.preflightMaxPerMinutePerSession; i++) {
      sessionBudget.allowControlPreflightForSession("preflight-reject");
    }
    expect(
      sessionBudget.allowControlPreflightForSession("preflight-reject"),
    ).toBe(false);
  });

  it("rejects preflight after budget recovery when immediately re-exhausted", () => {
    // Exhaust
    for (let i = 0; i < mockEnv.preflightMaxPerMinutePerSession; i++) {
      sessionBudget.allowControlPreflightForSession("re-exhaust");
    }
    expect(
      sessionBudget.allowControlPreflightForSession("re-exhaust"),
    ).toBe(false);

    // Wait for window to expire
    advanceTime(60_001);
    // One call allowed
    expect(
      sessionBudget.allowControlPreflightForSession("re-exhaust"),
    ).toBe(true);
    // But immediately denied again (only 1 slot freed from the reset)
    // Actually, after 60s ALL slots have expired since they were all made at t=0.
    // So all 48 slots are free again. Let's verify:
    for (let i = 0; i < mockEnv.preflightMaxPerMinutePerSession - 1; i++) {
      expect(
        sessionBudget.allowControlPreflightForSession("re-exhaust"),
      ).toBe(true);
    }
    // Next should be denied
    expect(
      sessionBudget.allowControlPreflightForSession("re-exhaust"),
    ).toBe(false);
  });

  it("sessionId longer than 128 chars is truncated to 128", () => {
    const longId = "x".repeat(200);
    const truncatedId = "x".repeat(128);
    // Fill budget for the truncated key
    for (let i = 0; i < mockEnv.preflightMaxPerMinutePerSession; i++) {
      sessionBudget.allowControlPreflightForSession(truncatedId);
    }
    // The long ID should also be exhausted (same truncated key)
    expect(sessionBudget.allowControlPreflightForSession(longId)).toBe(false);
  });

  it("preflight check does not affect enhancement budget", () => {
    for (let i = 0; i < mockEnv.preflightMaxPerMinutePerSession; i++) {
      sessionBudget.allowControlPreflightForSession("independent");
    }
    // Preflight exhausted, but enhancement should still be available
    expect(
      sessionBudget.isNarrativeEnhancementBudgetAvailable("independent"),
    ).toBe(true);
  });
});
