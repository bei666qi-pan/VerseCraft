/**
 * Chat turn benchmarks: print fixture sizes; optional live TTFT probe when E2E_AI_LIVE=1.
 * Default base URL http://localhost:666 (see package.json `pnpm dev`).
 */
import fs from "node:fs";
import path from "node:path";

type Fixture = {
  scenario: string;
  description?: string;
  latestUserInput: string;
  playerContext: string;
  observabilityNotes?: string;
};

const root = path.resolve(__dirname, "..");
const dir = path.join(root, "benchmarks", "chat-turns");

function loadFixtures(): Fixture[] {
  if (!fs.existsSync(dir)) {
    console.error("Missing benchmarks/chat-turns directory");
    return [];
  }
  const out: Fixture[] = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as Fixture;
    out.push(j);
  }
  return out.sort((a, b) => a.scenario.localeCompare(b.scenario));
}

async function probeOne(baseUrl: string, f: Fixture): Promise<void> {
  const body = {
    messages: [{ role: "user" as const, content: f.latestUserInput }],
    playerContext: f.playerContext,
    sessionId: `benchmark-${f.scenario}`,
  };
  const t0 = Date.now();
  let firstMs: number | null = null;
  let firstStatusMs: number | null = null;
  let firstTokenMs: number | null = null;
  let statusFrameCount = 0;
  let finalMs: number | null = null;
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(body),
  });
  const reader = res.body?.getReader();
  if (!reader) {
    console.log(`  ${f.scenario}: no body reader status=${res.status}`);
    return;
  }
  const dec = new TextDecoder();
  let buf = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      if (firstMs == null && buf.includes("data:")) firstMs = Date.now() - t0;
      const normalized = buf.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      const events = normalized.split("\n\n");
      for (const ev of events) {
        for (const line of ev.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const chunk = line.slice(5).trimStart();
          if (!chunk) continue;
          if (chunk.startsWith("__VERSECRAFT_STATUS__:")) {
            statusFrameCount += 1;
            if (firstStatusMs == null) firstStatusMs = Date.now() - t0;
            continue;
          }
          if (firstTokenMs == null) firstTokenMs = Date.now() - t0;
          if (chunk.startsWith("__VERSECRAFT_FINAL__:") && finalMs == null) {
            finalMs = Date.now() - t0;
          }
        }
      }
      if (Date.now() - t0 > 120_000) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  console.log(
    `  ${f.scenario}: http=${res.status} firstSseMs=${firstMs ?? "n/a"} firstStatusMs=${firstStatusMs ?? "n/a"} firstTokenMs=${firstTokenMs ?? "n/a"} finalMs=${finalMs ?? "n/a"} statusFrames=${statusFrameCount} charsIn=${f.latestUserInput.length + f.playerContext.length}`
  );
}

async function main(): Promise<void> {
  const fixtures = loadFixtures();
  console.log(`Loaded ${fixtures.length} fixtures from benchmarks/chat-turns\n`);
  for (const f of fixtures) {
    const chars = f.latestUserInput.length + f.playerContext.length;
    const estTok = Math.ceil(chars / 4);
    console.log(
      `${f.scenario}: ~${chars} chars (~${estTok} tok est) — ${f.description ?? ""}`
    );
    if (f.observabilityNotes) console.log(`  notes: ${f.observabilityNotes}`);
  }

  if (process.env.E2E_AI_LIVE !== "1") {
    console.log("\nSet E2E_AI_LIVE=1 to probe live TTFT (requires dev server on BENCHMARK_BASE_URL).");
    return;
  }

  const baseUrl = process.env.BENCHMARK_BASE_URL ?? "http://localhost:666";
  console.log(`\nLive probe BENCHMARK_BASE_URL=${baseUrl}\n`);
  for (const f of fixtures) {
    try {
      await probeOne(baseUrl, f);
    } catch (e) {
      console.log(`  ${f.scenario}: error ${(e as Error).message}`);
    }
  }
}

void main();
