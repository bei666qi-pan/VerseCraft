import { performance } from "node:perf_hooks";
import { buildLorePacket } from "@/lib/worldKnowledge/retrieval/buildLorePacket";
import type { RetrievalCandidate, RuntimeLoreRequest } from "@/lib/worldKnowledge/types";

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const idx = Math.min(values.length - 1, Math.max(0, Math.floor((values.length - 1) * p)));
  return values.slice().sort((a, b) => a - b)[idx] ?? 0;
}

function mkInput(): RuntimeLoreRequest {
  return {
    latestUserInput: "我在 1F_Lobby 遇到了 N-003，想确认规则",
    userId: "bench_user",
    sessionId: "bench_session",
    playerLocation: "1F_Lobby",
    recentlyEncounteredEntities: ["N-003"],
    taskType: "PLAYER_CHAT",
    tokenBudget: 420,
    worldScope: ["core", "shared", "user", "session"],
    worldRevision: BigInt(1),
  };
}

function mkCandidates(n: number): RetrievalCandidate[] {
  const out: RetrievalCandidate[] = [];
  for (let i = 0; i < n; i += 1) {
    out.push({
      fact: {
        identity: { factKey: `bench:${i}` },
        layer: i % 5 === 0 ? "user_private_lore" : "shared_public_lore",
        factType: i % 3 === 0 ? "location" : i % 3 === 1 ? "npc" : "rule",
        canonicalText: `候选事实 ${i}：当前位置与实体相关规则摘要。`,
        source: { kind: "db", entityId: String(i) },
      },
      score: 100 - i,
      debug: { from: i % 2 === 0 ? "exact" : "fts" },
    });
  }
  return out;
}

async function main() {
  const rounds = Number(process.argv[2] ?? 200);
  const candidates = mkCandidates(36);
  const input = mkInput();
  const durations: number[] = [];
  let totalChars = 0;

  for (let i = 0; i < rounds; i += 1) {
    const t0 = performance.now();
    const packet = buildLorePacket({
      input,
      candidates,
      queryFingerprint: `bench-${i % 8}`,
      cache: { level0MemoHit: i % 3 === 0, redisHit: i % 4 === 0, postgresHit: true, writtenToRedis: false },
      dbRoundTrips: 2,
    });
    const t1 = performance.now();
    durations.push(t1 - t0);
    totalChars += packet.compactPromptText.length;
  }

  const avg = durations.reduce((a, b) => a + b, 0) / Math.max(1, durations.length);
  const p50 = percentile(durations, 0.5);
  const p95 = percentile(durations, 0.95);
  const report = {
    rounds,
    p50_ms: Number(p50.toFixed(3)),
    p95_ms: Number(p95.toFixed(3)),
    avg_ms: Number(avg.toFixed(3)),
    avg_packet_chars: Math.round(totalChars / Math.max(1, rounds)),
    cache_hit_ratio_simulated: 0.333,
    fallback_ratio_simulated: 0,
  };

  console.info("[benchmark-world-retrieval]", JSON.stringify(report));
}

void main();
