import assert from "node:assert/strict";
import test from "node:test";

import { routeGenerationLane } from "./turnLaneRouter";

test("deterministic mechanics and narrative signals never pay embedding latency", async () => {
  let embeddingCalls = 0;
  const classifyAmbiguous = async () => {
    embeddingCalls += 1;
    return { classification: "mechanics" as const };
  };

  const mechanics = await routeGenerationLane({
    userInput: "锻造一把武器",
    worldId: "dark_moon_prologue",
    classifyAmbiguous,
  });
  const narrative = await routeGenerationLane({
    userInput: "我环顾四周，和老人打招呼",
    worldId: "dark_moon_prologue",
    classifyAmbiguous,
  });

  assert.equal(mechanics.lane, "mechanics");
  assert.equal(narrative.lane, "narrative");
  assert.equal(embeddingCalls, 0);
});

test("ambiguous input keeps world scope and respects the 300ms deadline", async () => {
  let observedWorldId = "";
  const result = await routeGenerationLane({
    userInput: "我想看看装备能不能修",
    worldId: "xingni_taichu",
    deadlineMs: 5,
    classifyAmbiguous: async (_text, worldId) => {
      observedWorldId = worldId;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { classification: "mechanics" as const };
    },
  });

  assert.equal(observedWorldId, "xingni_taichu");
  assert.equal(result.lane, "narrative");
  assert.equal(result.source, "deadline_fallback");
});
