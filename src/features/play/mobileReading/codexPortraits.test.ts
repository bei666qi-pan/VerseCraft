import assert from "node:assert/strict";
import test from "node:test";
import { resolveCodexPortrait } from "./codexPortraits";

test("mobile codex portrait resolver returns null for unconfigured portraits", () => {
  assert.equal(resolveCodexPortrait("N-008"), null);
});

test("mobile codex portrait resolver returns configured portrait data", () => {
  const portrait = resolveCodexPortrait("N-008", {
    "N-008": { src: "/images/codex/npc/N-008.webp", alt: "电工老刘" },
  });

  assert.deepEqual(portrait, { src: "/images/codex/npc/N-008.webp", alt: "电工老刘" });
});
