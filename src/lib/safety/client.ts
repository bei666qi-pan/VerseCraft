import type { FetchLike } from "@/lib/safety/baidu/tokenClient";
import { getBaiduSinanConfigFromEnv } from "@/lib/safety/baidu/env";
import { BaiduSinanTextProvider } from "@/lib/safety/baidu/baiduTextCensorProvider";
import type { ModerationRequest, ModerationResult } from "@/lib/safety/types";
import { envNumber } from "@/lib/config/envRaw";
import { setTimeout as sleep } from "node:timers/promises";

function allowResult(reasonCode: string, provider = "system"): ModerationResult {
  return {
    decision: "allow",
    riskLevel: "normal",
    categories: ["none"],
    score: 0,
    reasonCode,
    evidence: {
      provider,
      errorKind: undefined,
      errorMessage: undefined,
    },
  };
}

let singleton: BaiduSinanTextProvider | null = null;
let singletonCfgKey: string | null = null;

type CircuitState = {
  failureCount: number;
  windowStartAt: number;
  openUntilAt: number;
};

const circuitByKey = new Map<string, CircuitState>();

function getStageKey(stage: ModerationRequest["stage"]): "input" | "output" | "public" {
  if (stage === "input") return "input";
  if (stage === "output") return "output";
  return "public";
}

function stageFailMode(cfg: ReturnType<typeof getBaiduSinanConfigFromEnv>, stage: ModerationRequest["stage"]) {
  return stage === "input" || stage === "output" ? cfg.failModePrivate : cfg.failModePublic;
}

function circuitFailureThreshold(): number {
  return envNumber("BAIDU_SINAN_CIRCUIT_FAILURE_THRESHOLD", 3);
}
function circuitWindowMs(): number {
  return envNumber("BAIDU_SINAN_CIRCUIT_WINDOW_MS", 60_000);
}
function circuitCooldownMs(): number {
  return envNumber("BAIDU_SINAN_CIRCUIT_COOLDOWN_MS", 60_000);
}

function getCircuitKey(cfgKey: string, stage: ModerationRequest["stage"]): string {
  return `${cfgKey}:circuit:${getStageKey(stage)}`;
}

function buildCircuitOpenResult(args: {
  cfg: ReturnType<typeof getBaiduSinanConfigFromEnv>;
  stage: ModerationRequest["stage"];
}): ModerationResult {
  const failMode = stageFailMode(args.cfg, args.stage);
  const decision: "allow" | "block" = failMode === "fail_closed" ? "block" : "allow";
  return {
    decision,
    riskLevel: decision === "allow" ? "normal" : "black",
    categories: ["baidu_circuit_open"],
    score: decision === "allow" ? 35 : 90,
    reasonCode: "baidu_circuit_open",
    evidence: {
      provider: "baidu_text_censor",
      errorKind: "circuit_open",
      errorMessage: "circuit_open_skip_provider",
    },
  };
}

function cfgKey(cfg: ReturnType<typeof getBaiduSinanConfigFromEnv>): string {
  // Do not include secret in cache key.
  return [
    cfg.enabled,
    cfg.provider,
    cfg.authMode,
    cfg.tokenUrl,
    cfg.textCensorUrl,
    cfg.timeoutMs,
    cfg.connectTimeoutMs,
    cfg.inputEnabled,
    cfg.outputEnabled,
    cfg.publicContentEnabled,
    cfg.failModePrivate,
    cfg.failModePublic,
    cfg.logRawText,
    cfg.hashSalt,
    cfg.strictnessProfile,
  ].join("|");
}

function stageEnabled(cfg: ReturnType<typeof getBaiduSinanConfigFromEnv>, stage: ModerationRequest["stage"]): boolean {
  if (stage === "input") return cfg.inputEnabled;
  if (stage === "output") return cfg.outputEnabled;
  return cfg.publicContentEnabled;
}

export async function moderateTextWithBaidu(
  req: ModerationRequest & { fetchImpl?: FetchLike }
): Promise<ModerationResult> {
  const cfg = getBaiduSinanConfigFromEnv();
  if (!cfg.enabled) {
    return allowResult("baidu_sinan_disabled");
  }

  if (!stageEnabled(cfg, req.stage)) {
    return allowResult(`baidu_sinan_stage_disabled:${req.stage}`, "baidu_text_censor");
  }

  const cacheKey = cfgKey(cfg);
  const circuitKey = getCircuitKey(cacheKey, req.stage);
  const now = Date.now();
  const circuit = circuitByKey.get(circuitKey);
  if (circuit && circuit.openUntilAt > now) {
    return buildCircuitOpenResult({ cfg, stage: req.stage });
  }

  // Provider singleton: reuse token cache within the process.
  const key = cacheKey;
  if (!singleton || singletonCfgKey !== key) {
    singletonCfgKey = key;
    singleton = new BaiduSinanTextProvider(cfg, { fetchImpl: req.fetchImpl });
  }

  // If test passed fetchImpl but singleton already exists, provider will keep old fetchImpl.
  // For strict testing, pass different process env or avoid using singleton by instantiating the provider directly.
  const provider = singleton;
  const maxRetries = 1; // stage1: keep conservative; provider already does timeouts + classification
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const r = await provider.moderateText(req);
    const errKind = r.evidence?.errorKind;
    const retryable = errKind === "network_timeout" || errKind === "service_error" || errKind === "unknown_error";
    const shouldRetry = retryable && attempt < maxRetries;

    if (!shouldRetry) {
      // Update circuit state (best-effort, never throw).
      try {
        const threshold = circuitFailureThreshold();
        const winMs = circuitWindowMs();
        const cdMs = circuitCooldownMs();
        const existing = circuitByKey.get(circuitKey);
        const failureNow = Boolean(errKind);
        if (!existing) {
          const failureCount = failureNow ? 1 : 0;
          const openUntilAt = failureNow && failureCount >= threshold ? now + cdMs : 0;
          circuitByKey.set(circuitKey, {
            failureCount,
            windowStartAt: now,
            openUntilAt,
          });
        } else {
          if (!failureNow) {
            existing.failureCount = 0;
            existing.windowStartAt = now;
            existing.openUntilAt = 0;
          } else {
            if (now - existing.windowStartAt > winMs) {
              existing.failureCount = 1;
              existing.windowStartAt = now;
            } else {
              existing.failureCount += 1;
            }
            if (existing.failureCount >= threshold) {
              existing.openUntilAt = now + cdMs;
            }
          }
        }
      } catch {
        // ignore
      }
      return r;
    }
    await sleep(120 * (attempt + 1));
  }

  // Defensive fallback (should never reach here).
  return provider.moderateText(req);
}

// cfgKey() already excludes secrets, and can be reused as the base for circuit keys.

