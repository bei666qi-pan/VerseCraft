import test from "node:test";
import assert from "node:assert/strict";
import { detectPersonaMixup, rewritePersonaMixupConservatively } from "./personaMixupValidator";

test("personaMixup: 灵伤不应混入洗衣房阿姨的劳作/洗晾特征", () => {
  const narrative = "灵伤抬手把床单折得利落，围裙边还沾着一点漂白味。她笑得很亮。";
  const mix = detectPersonaMixup({ narrative, presentNpcIds: ["N-020", "N-014"], focusNpcId: "N-020" });
  assert.ok(mix.hits.some((h) => h.victimNpcId === "N-020" && h.leakedFromNpcId === "N-014"));
  const rw = rewritePersonaMixupConservatively({ narrative, hits: mix.hits });
  assert.equal(rw.changed, true);
  assert.equal(rw.narrative.includes("床单"), false);
});

test("personaMixup: 洗衣房阿姨不应被写成补给台/货架职能", () => {
  const narrative = "洗衣房阿姨站在补给台后，拍了拍货架，语气上扬得像在卖糖。";
  const mix = detectPersonaMixup({ narrative, presentNpcIds: ["N-014", "N-020"], focusNpcId: "N-014" });
  assert.ok(mix.hits.some((h) => h.victimNpcId === "N-014" && h.leakedFromNpcId === "N-020"));
});

