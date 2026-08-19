/**
 * 世界一致性 Mock Crossing 测试
 *
 * 验证三项第二轮修复在跨维度场景下的正确性：
 *  1. N-033/039/042 persona 签名补全
 *  2. social_event_must_not_reveal 后报检查
 *  3. NPC 跨回合位置瞬移检测（>3 层跳变）
 *
 * 重点：三个维度同时触发时，各校验不互相干扰。
 *
 * 本测试避免 import 任何 observability 依赖链的模块（如 epistmic/validator,
 * npcConsistency/validator, validateNarrative）。
 * 纯函数独立实现，零外部依赖。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { detectPersonaMixup, rewritePersonaMixupConservatively } from "./personaMixupValidator";

// ─── Helpers (self-contained to avoid server-only chains) ───────

function extractFloor(loc: string): number | null {
  if (!loc) return null;
  const b = loc.match(/B\s*(\d+)/i);
  if (b) return -parseInt(b[1] ?? "0", 10);
  const f = loc.match(/(\d+)\s*F/i);
  if (f) return parseInt(f[1] ?? "0", 10);
  const ch = loc.match(/([一二三四五六七B])楼/);
  if (ch) {
    const map: Record<string, number> = { "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "B": -1 };
    return map[ch[1]!] ?? null;
  }
  return null;
}

function detectTeleport(
  current: Map<string, string>,
  previous: Map<string, string>,
  narrative: string,
): { violations: string[]; logs: string[] } {
  const violations: string[] = [];
  const logs: string[] = [];
  if (previous.size === 0) return { violations, logs };

  const hasTravel = /电梯|楼梯|下楼|上楼|走下楼|走上楼|坐电梯|下到|上到|穿过楼层|跨层/i.test(narrative);

  for (const [npcId, cur] of current) {
    const prev = previous.get(npcId);
    if (!prev || prev === cur) continue;
    const pf = extractFloor(prev);
    const cf = extractFloor(cur);
    if (pf == null || cf == null) continue;
    const jump = Math.abs(cf - pf);
    if (jump <= 3) continue;
    if (!hasTravel) {
      violations.push(`${npcId}:${prev}→${cur}:jump_${jump}_floors`);
      logs.push(`${npcId} jumped ${jump} floors (${prev} → ${cur}) without travel`);
    } else {
      logs.push(`${npcId} moved ${jump} floors (${prev} → ${cur}) with travel context`);
    }
  }
  return { violations, logs };
}

/** 精简版 must_not_reveal 检测（与 validateNarrative.ts 行 718-754 等价）。 */
function detectMustNotReveal(
  narrative: string,
  options: string[],
  terms: string[],
): { narrativeLeaks: string[]; optionLeaks: string[] } {
  const nl: string[] = [];
  const ol: string[] = [];
  for (const t of terms) {
    if (t.length >= 2 && narrative.includes(t)) nl.push(t);
    for (const o of options) {
      if (t.length >= 2 && o.includes(t)) ol.push(t);
    }
  }
  return { narrativeLeaks: nl, optionLeaks: ol };
}

// ─── Fix 1: N-033/039/042 persona signatures ────────────────────

test("crossing: N-033 (老吴) signature detects persona mixup", () => {
  const n = "灵伤靠窗站着，腰背笔直。她拉了拉旧军装外套的衣角。";
  const mix = detectPersonaMixup({ narrative: n, presentNpcIds: ["N-020", "N-033"], focusNpcId: "N-020" });
  assert.ok(mix.hits.some((h) => h.leakedFromNpcId === "N-033"),
    `N-033 tokens should leak into N-020 context, got ${mix.hits.length} hits`);
});

test("crossing: N-039 (王老师) signature detects persona mixup", () => {
  // N-006 canonical name = "退休教师张先生", N-039 canonical name = "4F 王老师"
  const n = "退休教师张先生站在401室门口，说他跟4F 王老师从未照面，两人错开日子用同一间房。";
  const mix = detectPersonaMixup({ narrative: n, presentNpcIds: ["N-006", "N-039"], focusNpcId: "N-006" });
  assert.ok(mix.hits.some((h) => h.leakedFromNpcId === "N-039"),
    `N-039 tokens should leak into N-006 context`);
});

test("crossing: N-042 (老庄) signature detects persona mixup", () => {
  // N-034 canonical name = "7F 点灯阿珍"
  const n = "7F 点灯阿珍坐在窗台边，手里捏着一只空茶杯。她不喝，只闻茶香。";
  const mix = detectPersonaMixup({ narrative: n, presentNpcIds: ["N-034", "N-042"], focusNpcId: "N-034" });
  assert.ok(mix.hits.some((h) => h.leakedFromNpcId === "N-042"),
    `N-042 tokens should leak into N-034 context`);
});

// ─── Fix 2: must_not_reveal ─────────────────────────────────────

test("crossing: must_not_reveal in narrative", () => {
  const r = detectMustNotReveal(
    "那封秘密信函提到七锚闭环的真相。",
    ["继续追查", "忽略线索"],
    ["秘密信函", "校源协议", "七锚闭环"],
  );
  assert.ok(r.narrativeLeaks.length >= 1);
  assert.equal(r.optionLeaks.length, 0);
});

test("crossing: must_not_reveal in options", () => {
  const r = detectMustNotReveal(
    "走廊尽头有一扇门。",
    ["打开秘密信函", "把秘密信函交给欣蓝", "继续"],
    ["秘密信函", "校源协议"],
  );
  assert.ok(r.optionLeaks.length >= 1);
});

test("crossing: must_not_reveal clean pass", () => {
  const r = detectMustNotReveal(
    "空气中有淡淡的消毒水味道。",
    ["继续前进", "查看四周"],
    ["秘密信函", "校源协议", "七锚闭环"],
  );
  assert.equal(r.narrativeLeaks.length, 0);
  assert.equal(r.optionLeaks.length, 0);
});

// ─── Fix 3: NPC location teleport ───────────────────────────────

test("crossing: teleport >3 floors without travel explanation", () => {
  const r = detectTeleport(
    new Map([["N-001", "7F_Hallway"]]),
    new Map([["N-001", "B2_BoilerRoom"]]),
    "陈婆婆出现在顶楼走廊尽头。",
  );
  assert.ok(r.violations.length > 0);
  assert.ok(r.violations[0]!.includes("jump_9_floors"));
});

test("crossing: teleport with elevator explanation NOT flagged", () => {
  const r = detectTeleport(
    new Map([["N-001", "7F_Hallway"]]),
    new Map([["N-001", "B2_BoilerRoom"]]),
    "你坐电梯上到七楼，看到陈婆婆已经在等着了。",
  );
  assert.equal(r.violations.length, 0);
  assert.ok(r.logs.some((l) => l.includes("travel")));
});

test("crossing: <=3 floors not flagged", () => {
  const r = detectTeleport(
    new Map([["N-020", "1F_Lobby"]]),
    new Map([["N-020", "3F_Hallway"]]),
    "灵伤从楼上下来了。",
  );
  assert.equal(r.violations.length, 0);
});

test("crossing: first turn handles empty previous safely", () => {
  const r = detectTeleport(
    new Map([["N-001", "7F_Hallway"]]),
    new Map<string, string>(),
    "陈婆婆站在顶楼。",
  );
  assert.equal(r.violations.length, 0);
});

// ─── Triple dimension crossing ──────────────────────────────────

test("crossing: triple — persona + must_not_reveal + teleport all fire", () => {
  const narrative = "灵伤站在六楼，摸了摸旧军装外套，想起秘密信函的内容，神色恍惚。";

  // 1. Persona
  const mix = detectPersonaMixup({ narrative, presentNpcIds: ["N-020", "N-033"], focusNpcId: "N-020" });
  assert.ok(mix.hits.some((h) => h.leakedFromNpcId === "N-033"), "persona");

  // 2. Must not reveal
  const mnr = detectMustNotReveal(narrative, ["追问秘密信函"], ["秘密信函"]);
  assert.ok(mnr.narrativeLeaks.length >= 1, "must_not_reveal");

  // 3. Teleport
  const tp = detectTeleport(
    new Map([["N-001", "6F_Hallway"]]),
    new Map([["N-001", "B1_BoilerRoom"]]),
    narrative,
  );
  assert.ok(tp.violations.length > 0, "teleport");

  // All three independently verified.
});

// ─── Rewrite pipeline preserves dimension fixes ─────────────────

test("crossing: persona rewrite leaves must_not_reveal detectable", () => {
  const narrative = "灵伤在窗台边整理空茶杯，旧军装外套的下摆沾了灰。秘密信函已不重要。";
  const mix = detectPersonaMixup({ narrative, presentNpcIds: ["N-020", "N-033", "N-042"], focusNpcId: "N-020" });
  const rw = rewritePersonaMixupConservatively({ narrative, hits: mix.hits });
  assert.equal(rw.changed, true);
  const mnr = detectMustNotReveal(rw.narrative, ["继续"], ["秘密信函"]);
  assert.ok(mnr.narrativeLeaks.length >= 1, "must_not_reveal still fires after persona rewrite");
});
