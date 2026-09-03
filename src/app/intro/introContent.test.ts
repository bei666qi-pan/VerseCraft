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
  XINGNI_CARD_IMAGE,
} from "./introContent";

test("intro content keeps the darkmoon world as the first playable slide", () => {
  assert.equal(INTRO_PAGE_TITLE, "选择世界观");
  assert.equal(INTRO_PAGE_SUBTITLE, "AI 互动叙事世界");
  assert.equal(INTRO_TITLE, "序章 · 暗月");
  assert.equal(INTRO_CTA, "进入公寓");
  assert.equal(INTRO_DISABLED_CTA, "世界观筹备中");
  assert.equal(INTRO_WORLD_SLIDES.length, 5);
  const firstSlide = INTRO_WORLD_SLIDES[0];
  assert.equal(firstSlide.id, "darkmoon");
  assert.equal(firstSlide.available, true);
  assert.ok("imageSrc" in firstSlide);
  assert.equal(firstSlide.imageSrc, DARKMOON_CARD_IMAGE);
  assert.ok(DARKMOON_CARD_IMAGE.startsWith("/assets/intro/"));
  assert.ok(DARKMOON_CARD_IMAGE.endsWith(".jpg"));
  assert.deepEqual(INTRO_PARAGRAPHS, firstSlide.introBody);
});

test("xingni is the second playable world and later placeholders remain unavailable", () => {
  const xingni = INTRO_WORLD_SLIDES[1];
  assert.equal(xingni.worldId, "xingni_taichu");
  assert.equal(xingni.available, true);
  assert.equal(xingni.imageSrc, XINGNI_CARD_IMAGE);
  assert.ok(XINGNI_CARD_IMAGE.startsWith("/assets/intro/xingni-qingshi-card-"));
  assert.ok(XINGNI_CARD_IMAGE.endsWith(".jpg"));
  assert.match(xingni.introBody.join(""), /第一处区域|世界全貌/);

  for (const slide of INTRO_WORLD_SLIDES.slice(2)) {
    assert.equal(slide.available, false);
    assert.equal("imageSrc" in slide ? slide.imageSrc : undefined, undefined);
  }
});
