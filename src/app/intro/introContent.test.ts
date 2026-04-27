import test from "node:test";
import assert from "node:assert/strict";
import {
  DARKMOON_CARD_IMAGE,
  INTRO_CTA,
  INTRO_DISABLED_CTA,
  INTRO_PAGE_SUBTITLE,
  INTRO_PAGE_TITLE,
  INTRO_PARAGRAPHS,
  INTRO_TITLE,
  INTRO_WORLD_SLIDES,
} from "./introContent";

test("intro content keeps the darkmoon world as the first playable slide", () => {
  assert.equal(INTRO_PAGE_TITLE, "选择世界观");
  assert.equal(INTRO_PAGE_SUBTITLE, "不同的世界，不同的故事");
  assert.equal(INTRO_TITLE, "序章 · 暗月");
  assert.equal(INTRO_CTA, "书写想象");
  assert.equal(INTRO_DISABLED_CTA, "世界观筹备中");
  assert.equal(INTRO_WORLD_SLIDES.length, 5);
  assert.equal(INTRO_WORLD_SLIDES[0].id, "darkmoon");
  assert.equal(INTRO_WORLD_SLIDES[0].available, true);
  assert.equal(INTRO_WORLD_SLIDES[0].imageSrc, DARKMOON_CARD_IMAGE);
  assert.ok(DARKMOON_CARD_IMAGE.startsWith("/assets/intro/"));
  assert.ok(DARKMOON_CARD_IMAGE.endsWith(".jpg"));
  assert.deepEqual(INTRO_PARAGRAPHS, INTRO_WORLD_SLIDES[0].introBody);
});

test("placeholder worlds remain unavailable and image-free", () => {
  for (const slide of INTRO_WORLD_SLIDES.slice(1)) {
    assert.equal(slide.available, false);
    assert.equal(slide.imageSrc, undefined);
  }
});
