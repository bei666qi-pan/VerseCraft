import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { resolveCodexPortrait } from "./codexPortraits";

test("mobile codex portrait resolver maps registry ids to CDN-cacheable static assets", () => {
  assert.deepEqual(resolveCodexPortrait("N-008"), {
    src: "/assets/npc-avatars/N-008.png",
    basePath: "/assets/npc-avatars/N-008",
    alt: "电工老刘",
    objectPosition: "center top",
  });

  assert.deepEqual(resolveCodexPortrait("A-002"), {
    src: "/assets/npc-avatars/A-002.png",
    basePath: "/assets/npc-avatars/A-002",
    alt: "无头猎犬",
    objectPosition: "center top",
  });

  assert.deepEqual(resolveCodexPortrait("XQ-N002"), {
    src: "/assets/npc-avatars/xingni/XQ-N002.png",
    basePath: "/assets/npc-avatars/xingni/XQ-N002",
    alt: "沈清禾",
    objectPosition: "center top",
  });
});

test("mobile codex portrait resolver still accepts an override map", () => {
  const portrait = resolveCodexPortrait("N-008", {
    "N-008": { src: "/images/codex/npc/N-008.webp", alt: "电工老刘" },
  });

  assert.deepEqual(portrait, { src: "/images/codex/npc/N-008.webp", alt: "电工老刘" });
});

test("all eight Xingni NPC portraits include fallback and multi-density formats", () => {
  for (let index = 1; index <= 8; index += 1) {
    const id = `XQ-N${String(index).padStart(3, "0")}`;
    const base = join(process.cwd(), "public/assets/npc-avatars/xingni", id);
    for (const suffix of [".png", "@1x.avif", "@1x.webp", "@2x.avif", "@2x.webp", "@3x.avif", "@3x.webp"]) {
      assert.equal(existsSync(`${base}${suffix}`), true, `${id}${suffix} should exist`);
    }
  }
});
