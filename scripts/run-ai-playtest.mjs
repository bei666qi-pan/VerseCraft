#!/usr/bin/env node

/**
 * Run live AI evaluations against a dedicated VerseCraft SUT.
 *
 * This deliberately does not reuse :666: that server may have been launched
 * outside `kimi -ds` and therefore carry a stale gateway/model binding.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const smokeOnly = process.argv.includes("--smoke");
const profilePath = path.join(root, "src", "config", "kimi-ds-ai.profile.json");
const interruptController = new AbortController();
let interruptedSignal = null;
let activeChild = null;
const cleanupTargets = new Set();

function cleanupTemporaryArtifacts({ ignoreErrors = false } = {}) {
  for (const target of [...cleanupTargets]) {
    try {
      fs.rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      cleanupTargets.delete(target);
    } catch (error) {
      if (!ignoreErrors) throw error;
    }
  }
}

process.once("exit", () => cleanupTemporaryArtifacts({ ignoreErrors: true }));

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    interruptedSignal ??= signal;
    interruptController.abort(new Error(`Interrupted by ${signal}`));
    if (activeChild?.exitCode === null) activeChild.kill(signal);
  });
}

function isKimiOpenAiSession(env) {
  return (
    (env.KIMI_MODEL_PROVIDER_TYPE ?? "").trim().toLowerCase() === "openai" &&
    Boolean((env.KIMI_MODEL_BASE_URL ?? "").trim()) &&
    Boolean((env.KIMI_MODEL_API_KEY ?? "").trim()) &&
    Boolean((env.KIMI_MODEL_NAME ?? "").trim())
  );
}

function buildSutEnv() {
  const env = { ...process.env };
  if (isKimiOpenAiSession(env)) {
    const profile = JSON.parse(fs.readFileSync(profilePath, "utf8"));
    for (const [name, value] of Object.entries(profile)) {
      if (typeof value === "string" && value.trim()) env[name] = value.trim();
    }
  }
  env.E2E_AI_LIVE = "1";
  env.AI_EXPOSE_ROUTING_HEADER = "1";
  return env;
}

async function reservePort() {
  return await new Promise((resolve, reject) => {
    const listener = net.createServer();
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", () => {
      const address = listener.address();
      const port = typeof address === "object" && address ? address.port : 0;
      listener.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    if (interruptedSignal) {
      reject(new Error(`Interrupted by ${interruptedSignal}`));
      return;
    }
    const child = spawn(command, args, { cwd: root, env, stdio: "inherit" });
    activeChild = child;
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (activeChild === child) activeChild = null;
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} failed (${signal ?? `exit ${code}`})`));
    });
  });
}

async function waitForSut(baseUrl, server, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (interruptedSignal) throw new Error(`Interrupted by ${interruptedSignal}`);
    if (server.exitCode !== null) {
      throw new Error(`Dedicated VerseCraft SUT exited before readiness (exit ${server.exitCode}).`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(2_000) });
      if (response.status > 0) return;
    } catch {
      // Next.js is still starting/compiling.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Dedicated VerseCraft SUT was not ready within ${timeoutMs}ms.`);
}

async function runSmoke(baseUrl) {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: {
      Accept: "text/event-stream",
      "Content-Type": "application/json",
      "X-Forwarded-For": "127.0.4.23",
    },
    body: JSON.stringify({
      messages: [{ role: "user", content: "环顾房间，确认眼前最值得调查的线索。" }],
      playerContext: "{}",
      sessionId: `ai-playtest-smoke-${Date.now()}`,
    }),
    signal: AbortSignal.any([interruptController.signal, AbortSignal.timeout(180_000)]),
  });
  const body = await response.text();
  const prefix = "data: __VERSECRAFT_FINAL__:";
  const finalLine = body.split(/\r?\n/).find((line) => line.startsWith(prefix));
  if (!response.ok || !finalLine) {
    throw new Error(`AI smoke failed: HTTP ${response.status}, final_frame=${Boolean(finalLine)}`);
  }
  let final;
  try {
    final = JSON.parse(finalLine.slice(prefix.length));
  } catch {
    throw new Error("AI smoke failed: final SSE frame is not valid JSON.");
  }
  const narrative = typeof final.narrative === "string" ? final.narrative.trim() : "";
  const degraded = final.internal_meta?.kind === "site_unavailable" || narrative.includes("暂时无法完成本次生成");
  if (!narrative || degraded) {
    throw new Error(`AI smoke failed: degraded=${degraded}, narrative_chars=${narrative.length}`);
  }
  const routing = response.headers.get("x-versecraft-ai-routing");
  console.log(
    `[ai-playtest] smoke passed: HTTP ${response.status}, final_frame=true, narrative_chars=${narrative.length}, routing_header=${routing ? "present" : "absent"}`
  );
}

function stopServer(server) {
  return new Promise((resolve) => {
    if (server.exitCode !== null || !server.pid) return resolve();
    const timer = setTimeout(() => {
      try {
        process.kill(-server.pid, "SIGKILL");
      } catch {
        // Already stopped.
      }
      resolve();
    }, 5_000);
    server.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {
      clearTimeout(timer);
      resolve();
    }
  });
}

async function main() {
  const env = buildSutEnv();
  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const temporaryTsconfig = `.tsconfig.ai-playtest-${port}.json`;
  const temporaryDistDir = `.runtime-data/next-ai-playtest-${port}`;
  cleanupTargets.add(path.join(root, temporaryTsconfig));
  cleanupTargets.add(path.join(root, temporaryDistDir));
  fs.copyFileSync(path.join(root, "tsconfig.json"), path.join(root, temporaryTsconfig));
  Object.assign(env, {
    LIVEPLAY_BASE_URL: baseUrl,
    BENCHMARK_BASE_URL: baseUrl,
    PLAYWRIGHT_BASE_URL: baseUrl,
    VERSECRAFT_NEXT_DIST_DIR: temporaryDistDir,
    VERSECRAFT_NEXT_TSCONFIG_PATH: temporaryTsconfig,
  });

  console.log(
    `[ai-playtest] starting dedicated SUT on ${baseUrl}; binding=${isKimiOpenAiSession(env) ? "kimi-openai" : "project-env"}; mode=${smokeOnly ? "smoke" : "full"}`
  );
  const server = spawn("pnpm", ["exec", "next", "dev", "--webpack", "-p", String(port)], {
    cwd: root,
    env,
    stdio: "inherit",
    detached: true,
  });

  try {
    await waitForSut(baseUrl, server);
    if (smokeOnly) {
      await runSmoke(baseUrl);
      return;
    }
    await run("pnpm", ["eval:playthrough:ai"], env);
    await run(
      "pnpm",
      ["eval:narrative-safety", "--", "--mode", "live", "--assert", "--json-out", ".runtime-data/eval/narrative-safety-live.json"],
      env
    );
    await run(
      "pnpm",
      ["probe:director:live", "--", "--json-out", ".runtime-data/eval/director-live-evidence.json"],
      { ...env, VERSECRAFT_ALLOW_LIVE_DIRECTOR_PROBE: "1" }
    );
  } finally {
    await stopServer(server);
    // Next's detached worker may finish its final filesystem bookkeeping just
    // after the CLI parent exits. Wait briefly so cleanup is not recreated as
    // an empty directory by that final tick.
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    cleanupTemporaryArtifacts();
  }
}

main().catch((error) => {
  console.error(`[ai-playtest] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = interruptedSignal === "SIGINT" ? 130 : interruptedSignal === "SIGTERM" ? 143 : 1;
});
