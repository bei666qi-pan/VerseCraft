import assert from "node:assert/strict";
import { test } from "node:test";
import { persistTurnFacts } from "./persistTurnFacts";
import { WORLD_KNOWLEDGE_MAX_WRITEBACK_FACTS } from "../constants";

test("重复事实会 merge，不会无限膨胀", async () => {
  let writeCount = 0;
  const res = await persistTurnFacts(
    {
      requestId: "r1",
      latestUserInput: "我在 7F_Bench 看见了红钥匙",
      dmRecord: {
        narrative: "你在 7F_Bench 看见了红钥匙。",
        player_location: "7F_Bench",
      },
      userId: "u1",
      sessionId: "s1",
      maxFacts: 12,
    },
    {
      async createConflictProbe() {
        return {
          async hasCoreConflict() {
            return false;
          },
          async hasSharedConflict() {
            return false;
          },
          async hasPrivateConflict() {
            return false;
          },
        };
      },
      async enqueueSharedCandidate() {
        // no-op
      },
      async persistPrivateFacts(decisions) {
        writeCount = new Set(decisions.filter((d) => d.action === "allow_private").map((d) => d.fact.normalized)).size;
        return writeCount;
      },
    }
  );
  assert.ok(res.extractedCount >= 1);
  assert.equal(res.privateOrSessionWritten, writeCount);
});

test("模糊叙述不会轻易升级为 shared candidate", async () => {
  let queued = 0;
  const res = await persistTurnFacts(
    {
      requestId: "r2",
      latestUserInput: "我猜楼下可能有隐藏房间",
      dmRecord: { narrative: "你似乎听到楼下有动静。" },
      userId: "u2",
      sessionId: "s2",
    },
    {
      async createConflictProbe() {
        return {
          async hasCoreConflict() {
            return false;
          },
          async hasSharedConflict() {
            return false;
          },
          async hasPrivateConflict() {
            return false;
          },
        };
      },
      async enqueueSharedCandidate() {
        queued += 1;
      },
      async persistPrivateFacts() {
        return 1;
      },
    }
  );
  assert.equal(queued, 0);
  assert.equal(res.sharedCandidateQueued, 0);
});

test("写回提取数量受上限约束", async () => {
  const res = await persistTurnFacts(
    {
      requestId: "r3",
      latestUserInput: "我在 1F_Lobby 看见异常",
      dmRecord: {
        narrative: "叙述",
        codex_updates: Array.from({ length: 20 }).map((_, i) => ({ title: `线索${i}`, content: `内容${i}` })),
      },
      userId: "u3",
      sessionId: "s3",
      maxFacts: 999,
    },
    {
      async createConflictProbe() {
        return {
          async hasCoreConflict() {
            return false;
          },
          async hasSharedConflict() {
            return false;
          },
          async hasPrivateConflict() {
            return false;
          },
        };
      },
      async enqueueSharedCandidate() {},
      async persistPrivateFacts() {
        return 0;
      },
    }
  );
  assert.ok(res.extractedCount <= WORLD_KNOWLEDGE_MAX_WRITEBACK_FACTS);
});
