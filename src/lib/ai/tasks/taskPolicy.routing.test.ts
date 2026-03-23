import test from "node:test";
import assert from "node:assert/strict";
import { resolveOrderedRoleChain } from "@/lib/ai/tasks/taskPolicy";

function withEnv(patch: Record<string, string | undefined>, fn: () => void): void {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(patch)) {
    prev[k] = process.env[k];
    const v = patch[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    fn();
  } finally {
    for (const k of Object.keys(patch)) {
      const old = prev[k];
      if (old === undefined) delete process.env[k];
      else process.env[k] = old;
    }
  }
}

test("PLAYER_CHAT role chain never includes reasoner", () => {
  withEnv(
    {
      AI_MODEL_MAIN: "main-x",
      AI_MODEL_CONTROL: "control-x",
      AI_MODEL_REASONER: "reasoner-x",
      AI_PLAYER_ROLE_CHAIN: "reasoner,control,main",
    },
    () => {
      const chain = resolveOrderedRoleChain("PLAYER_CHAT");
      assert.equal(chain.includes("reasoner"), false);
      assert.equal(chain[0], "main");
    }
  );
});

test("offline fail-fast keeps WORLDBUILD_OFFLINE out of control fallback", () => {
  withEnv(
    {
      AI_MODEL_MAIN: "main-x",
      AI_MODEL_CONTROL: "control-x",
      AI_MODEL_REASONER: "reasoner-x",
      AI_OFFLINE_FAILFAST: "1",
      AI_OFFLINE_ALLOW_MAIN_FALLBACK: "0",
    },
    () => {
      const chain = resolveOrderedRoleChain("WORLDBUILD_OFFLINE");
      assert.deepEqual(chain, ["reasoner"]);
    }
  );
});

