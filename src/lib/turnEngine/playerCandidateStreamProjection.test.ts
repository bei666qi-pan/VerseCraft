import test from "node:test";
import assert from "node:assert/strict";
import { projectPlayerCandidateStreamDelta } from "@/lib/turnEngine/playerCandidateStreamProjection";

test("terminal tool argument deltas remain visible to the incremental narrative parser", () => {
  assert.deepEqual(
    projectPlayerCandidateStreamDelta({
      deltaContent: "",
      toolArgsDelta: '{"narrative":"走廊尽头传来脚步声。',
    }),
    {
      accumulatedDelta: '{"narrative":"走廊尽头传来脚步声。',
      visibleDelta: '{"narrative":"走廊尽头传来脚步声。',
    },
  );
});

test("plain content remains the preferred candidate stream when present", () => {
  assert.deepEqual(
    projectPlayerCandidateStreamDelta({
      deltaContent: '{"narrative":"窗外雨声渐密。',
      toolArgsDelta: "ignored-duplicate",
    }),
    {
      accumulatedDelta: '{"narrative":"窗外雨声渐密。',
      visibleDelta: '{"narrative":"窗外雨声渐密。',
    },
  );
});
