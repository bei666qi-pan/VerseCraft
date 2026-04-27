import assert from "node:assert/strict";
import test from "node:test";
import { resolveCodexPortrait } from "./codexPortraits";

test("mobile codex portrait resolver maps registry ids to CDN-cacheable static assets", () => {
  assert.deepEqual(resolveCodexPortrait("N-008"), {
    src: "/assets/npc-avatars/N-008.png",
    alt: "电工老刘",
    objectPosition: "center top",
  });

  assert.deepEqual(resolveCodexPortrait("A-002"), {
    src: "/assets/npc-avatars/A-002.png",
    alt: "无头猎犬",
    objectPosition: "center top",
  });
});

test("mobile codex portrait resolver still accepts an override map", () => {
  const portrait = resolveCodexPortrait("N-008", {
    "N-008": { src: "/images/codex/npc/N-008.webp", alt: "电工老刘" },
  });

  assert.deepEqual(portrait, { src: "/images/codex/npc/N-008.webp", alt: "电工老刘" });
});
