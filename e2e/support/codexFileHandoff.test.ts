import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CODEX_HANDOFF_PROTOCOL_VERSION,
  createCodexFileHandoff,
  readCodexHandoffRequest,
  submitCodexHandoffDecision,
  writeJsonAtomically,
} from "./codexFileHandoff";

const observation = {
  turnIndex: 0,
  url: "http://[::1]:666/play",
  narrative: "走廊尽头的灯闪了一下。",
  options: ["检查灯光"],
  inputEnabled: true,
};

async function waitForRequest(requestPath: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      return await readCodexHandoffRequest(requestPath);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw lastError ?? new Error("handoff request was not written");
}

test("Codex file handoff ignores stale decisions and accepts a matching submitted decision", async () => {
  const artifactDir = await mkdtemp(join(tmpdir(), "versecraft-codex-handoff-"));
  try {
    const handoff = createCodexFileHandoff({
      runId: "handoff-unit-run",
      artifactDir,
      timeoutMs: 1_000,
      pollIntervalMs: 10,
    });
    const pendingDecision = handoff.decisionProvider.decide(observation);
    const request = await waitForRequest(handoff.requestPath);

    assert.equal(request.protocolVersion, CODEX_HANDOFF_PROTOCOL_VERSION);
    assert.equal(request.mode, "developer");
    assert.deepEqual(request.observation, observation);
    assert.equal("clientState" in (request as Record<string, unknown>), false);

    await writeJsonAtomically(handoff.decisionPath, {
      protocolVersion: CODEX_HANDOFF_PROTOCOL_VERSION,
      runId: request.runId,
      turnIndex: request.turnIndex,
      ticket: "stale-ticket",
      action: "这条旧动作不该提交",
      intent: "stale",
      stop: false,
      decidedAt: new Date().toISOString(),
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    await submitCodexHandoffDecision(handoff.requestPath, {
      action: "检查走廊尽头的灯。",
      intent: "explore",
    });

    await assert.doesNotReject(pendingDecision.then((decision) => {
      assert.deepEqual(decision, { action: "检查走廊尽头的灯。", intent: "explore", stop: false });
    }));
  } finally {
    await rm(artifactDir, { recursive: true, force: true });
  }
});

test("Codex decision submission rejects an empty non-stop action", async () => {
  const artifactDir = await mkdtemp(join(tmpdir(), "versecraft-codex-handoff-"));
  try {
    const handoff = createCodexFileHandoff({ runId: "invalid-action-run", artifactDir });
    const pendingDecision = handoff.decisionProvider.decide(observation);
    await waitForRequest(handoff.requestPath);
    await assert.rejects(submitCodexHandoffDecision(handoff.requestPath, {}), /requires --action/);
    await submitCodexHandoffDecision(handoff.requestPath, { stop: true, intent: "end" });
    await pendingDecision;
  } finally {
    await rm(artifactDir, { recursive: true, force: true });
  }
});

test("blind handoff marks the observation request without adding internal game data", async () => {
  const artifactDir = await mkdtemp(join(tmpdir(), "versecraft-codex-handoff-"));
  try {
    const handoff = createCodexFileHandoff({ runId: "blind-run", artifactDir, mode: "blind" });
    const pendingDecision = handoff.decisionProvider.decide(observation);
    const request = await waitForRequest(handoff.requestPath);
    assert.equal(request.mode, "blind");
    assert.match(request.instructions, /盲测玩家/);
    assert.equal("clientState" in (request as Record<string, unknown>), false);
    await submitCodexHandoffDecision(handoff.requestPath, { stop: true, intent: "blind_stop" });
    await pendingDecision;
  } finally {
    await rm(artifactDir, { recursive: true, force: true });
  }
});
