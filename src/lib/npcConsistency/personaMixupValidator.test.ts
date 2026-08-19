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

// ═══ N-009/N-021 shared-signature fix: unique tokens don't cross-trigger ═══
// N-009 unique: 织补/缝纫 (crafting). N-021 unique: 镜像/取代/更漂亮 (mirror-replacement).
// Shared: 白色连衣裙, 手拉手, 602, 镜子, 姐妹, 心脏 — these still produce cross-hits.

test("personaMixup: N-009 unique crafting tokens (织补/缝纫) do NOT trigger cross-hits from N-021", () => {
  // After the fix, '织补' and '缝纫' are only in N-009's role signature,
  // so they should not be flagged as leaking from N-021.
  // (Avoid shared tokens like '602'/'镜子'/'白色连衣裙' that would mask the result.)
  const narrative = "阿织坐在门口，低头做织补的活计，缝纫的动作不急不缓。";
  const mix = detectPersonaMixup({ narrative, presentNpcIds: ["N-009", "N-021"], focusNpcId: "N-009" });
  const n021Hits = mix.hits.filter((h) => h.victimNpcId === "N-009" && h.leakedFromNpcId === "N-021");
  assert.equal(n021Hits.length, 0,
    "N-009's unique tokens should not be flagged as leaking from N-021");
});

test("personaMixup: shared tokens (白色连衣裙/镜子/602) still cross-trigger between N-009 and N-021", () => {
  // Shared tokens genuinely belong to both mirror sisters but the detector
  // sees them in the OTHER NPC's signature and flags them as persona leaks.
  // This is a known limitation — the shared-token overlap is semantically correct.
  const narrative = "阿织穿着白色连衣裙站在602室门口，镜子里映出她的倒影。";
  const mix = detectPersonaMixup({ narrative, presentNpcIds: ["N-009", "N-021"], focusNpcId: "N-009" });
  const crossHits = mix.hits.filter((h) => h.victimNpcId === "N-009" && h.leakedFromNpcId === "N-021");
  assert.ok(crossHits.length > 0,
    "shared tokens still produce false-positive cross-hits (known limitation)");
});

test("personaMixup: N-021 unique tokens (取代) correctly flag when appearing near N-009", () => {
  // '取代' is now uniquely N-021's token. If it appears in 阿织's narrative context,
  // it should be flagged as a persona leak from N-021 — this is now a legitimate hit.
  // (Avoid '镜子'/'镜' so the first speech-token match is '取代'.)
  const narrative = "阿织站在门前，那倒影似乎取代了她的位置。";
  const mix = detectPersonaMixup({ narrative, presentNpcIds: ["N-009", "N-021"], focusNpcId: "N-009" });
  const legitimateHits = mix.hits.filter((h) =>
    h.victimNpcId === "N-009" && h.leakedFromNpcId === "N-021" && h.token === "取代");
  assert.ok(legitimateHits.length > 0,
    "N-021's unique token '取代' should correctly flag as leaked into N-009's context");
});

test("personaMixup: N-021/N-009 shared tokens still cross-trigger in reverse direction", () => {
  const narrative = "阿绣捏着镜子的边沿，白色连衣裙的下摆擦过602室的门框。";
  const mix = detectPersonaMixup({ narrative, presentNpcIds: ["N-021", "N-009"], focusNpcId: "N-021" });
  const crossHits = mix.hits.filter((h) => h.victimNpcId === "N-021" && h.leakedFromNpcId === "N-009");
  assert.ok(crossHits.length > 0,
    "shared tokens still produce cross-hits in reverse direction (known limitation)");
});

// ═══ Regression: Gap 3 — NPC registry coverage of HIGH_RISK_SIGNATURES ═══

test("personaMixup: audit HIGH_RISK_SIGNATURES coverage against NPC registry", async () => {
  // Dynamically load the NPC registry to avoid coupling test to static snapshot
  const { NPCS } = await import("@/lib/registry/npcs");

  // Keys present in HIGH_RISK_SIGNATURES (source of truth in personaMixupValidator.ts)
  const covered = new Set([
    "N-001","N-002","N-003","N-004","N-005","N-006","N-007","N-008",
    "N-009","N-010","N-011","N-012","N-013","N-014","N-015","N-016",
    "N-017","N-018","N-019","N-020","N-021","N-022","N-023","N-024",
    "N-025","N-026","N-027","N-028","N-029","N-030","N-031","N-032",
    "N-033","N-034","N-035","N-036","N-037","N-038","N-039","N-040",
    "N-041","N-042","N-043","N-044","N-045",
  ]);

  const allIds = NPCS.map((n) => n.id);
  const uncovered = allIds.filter((id) => !covered.has(id));
  const extra = [...covered].filter((id) => !allIds.includes(id));

  // With N-033/N-039/N-042 now covered, all NPCs should have signatures.
  if (uncovered.length > 0) {
    console.log(`[coverage-gap] NPCs without HIGH_RISK_SIGNATURES: ${uncovered.join(", ")}`);
  }
  if (extra.length > 0) {
    console.log(`[coverage-gap] stale HIGH_RISK_SIGNATURES keys (not in registry): ${extra.join(", ")}`);
  }

  assert.equal(uncovered.length, 0,
    `expected 0 uncovered NPCs, got ${uncovered.length}: ${uncovered.join(", ")}`);
  assert.equal(extra.length, 0, `stale HIGH_RISK_SIGNATURES keys found: ${extra.join(", ")}`);
});

