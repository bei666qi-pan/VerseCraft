import { moderateTextWithBaidu } from "@/lib/safety/client";
import type { FetchLike } from "@/lib/safety/baidu/tokenClient";
import { performance } from "node:perf_hooks";

function makeResponse(jsonData: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => jsonData,
  } as unknown as Response;
}

function setEnv(overrides: Record<string, string>) {
  for (const [k, v] of Object.entries(overrides)) process.env[k] = v;
}

function buildFetchImpl(args: {
  mode: "allow" | "fail";
  counters: { token: number; censor: number };
}): FetchLike {
  return async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/oauth/2.0/token")) {
      args.counters.token += 1;
      return makeResponse({ access_token: "t", expires_in: 3600 });
    }
    if (url.includes("/text_censor/v2/user_defined")) {
      args.counters.censor += 1;
      if (args.mode === "allow") {
        return makeResponse({ conclusionType: 1, conclusion: "合规", data: [] });
      }
      return makeResponse({ conclusionType: 4, conclusion: "审核失败", error_msg: "x", data: [] });
    }
    throw new Error(`unexpected_url:${url}`);
  };
}

async function runPhase(args: {
  name: string;
  mode: "allow" | "fail";
  count: number;
  stage: "input" | "output" | "public";
  fetchImpl: FetchLike;
}) {
  const startedAt = performance.now();
  const promises: Array<Promise<unknown>> = [];
  for (let i = 0; i < args.count; i++) {
    promises.push(
      moderateTextWithBaidu({
        text: `t_${args.mode}_${i}`,
        scene: "private_story_output" as any,
        stage: args.stage,
        traceId: `${args.name}-${i}`,
        fetchImpl: args.fetchImpl,
      })
    );
  }
  const results = await Promise.all(promises);
  const elapsed = performance.now() - startedAt;
  const reasonCounts = new Map<string, number>();
  for (const r of results as any[]) {
    const rc = String(r?.reasonCode ?? "none");
    reasonCounts.set(rc, (reasonCounts.get(rc) ?? 0) + 1);
  }
  const topReasons = [...reasonCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  console.log(
    `[${args.name}] elapsedMs=${Math.round(elapsed)} avgMs=${Math.round(elapsed / args.count)} topReasons=${topReasons
      .map(([k, v]) => `${k}:${v}`)
      .join(",")}`
  );
}

async function main() {
  // Keep tests local-only: mock all Baidu fetches.
  setEnv({
    BAIDU_SINAN_ENABLED: "true",
    BAIDU_SINAN_PROVIDER: "baidu_text_censor",
    BAIDU_SINAN_API_KEY: "ak",
    BAIDU_SINAN_SECRET_KEY: "sk",
    BAIDU_SINAN_AUTH_MODE: "oauth_access_token",
    BAIDU_SINAN_TIMEOUT_MS: "2500",
    BAIDU_SINAN_CONNECT_TIMEOUT_MS: "1200",
    BAIDU_SINAN_INPUT_ENABLED: "true",
    BAIDU_SINAN_OUTPUT_ENABLED: "true",
    BAIDU_SINAN_PUBLIC_CONTENT_ENABLED: "true",
    BAIDU_SINAN_FAIL_MODE_PRIVATE: "fail_soft",
    BAIDU_SINAN_FAIL_MODE_PUBLIC: "fail_closed",
    BAIDU_SINAN_LOG_RAW_TEXT: "false",
    BAIDU_SINAN_STRICTNESS_PROFILE: "balanced",
    // circuit params set by phases below
    BAIDU_SINAN_HASH_SALT: `loadmock_${Date.now()}`,
  });

  const counters1 = { token: 0, censor: 0 };
  const fetchAllow = buildFetchImpl({ mode: "allow", counters: counters1 });
  setEnv({
    BAIDU_SINAN_CIRCUIT_FAILURE_THRESHOLD: "100",
    BAIDU_SINAN_CIRCUIT_WINDOW_MS: "1000",
    BAIDU_SINAN_CIRCUIT_COOLDOWN_MS: "100000",
  });
  await runPhase({ name: "phase-allow-concurrent", mode: "allow", count: 30, stage: "input", fetchImpl: fetchAllow });
  console.log(`[phase-allow-concurrent] tokenCalls=${counters1.token} censorCalls=${counters1.censor}`);

  // Circuit breaker: sequential warm-up to ensure open, then a small concurrent burst should skip provider.
  const counters2 = { token: 0, censor: 0 };
  const fetchFail = buildFetchImpl({ mode: "fail", counters: counters2 });
  setEnv({
    BAIDU_SINAN_CIRCUIT_FAILURE_THRESHOLD: "2",
    BAIDU_SINAN_CIRCUIT_WINDOW_MS: "1000",
    BAIDU_SINAN_CIRCUIT_COOLDOWN_MS: "60000",
    // provider singleton 会复用首次 fetchImpl，强制改变 cfgKey 触发重建。
    BAIDU_SINAN_HASH_SALT: `loadmock_fail_${Date.now()}`,
  });

  await moderateTextWithBaidu({
    text: "warmup_fail_1",
    scene: "private_story_output" as any,
    stage: "input",
    traceId: "warmup1",
    fetchImpl: fetchFail,
  });
  await moderateTextWithBaidu({
    text: "warmup_fail_2",
    scene: "private_story_output" as any,
    stage: "input",
    traceId: "warmup2",
    fetchImpl: fetchFail,
  });

  await runPhase({ name: "phase-circuit-open-burst", mode: "fail", count: 10, stage: "input", fetchImpl: fetchFail });
  console.log(`[phase-circuit-open-burst] tokenCalls=${counters2.token} censorCalls=${counters2.censor}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

