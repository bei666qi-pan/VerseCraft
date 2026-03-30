import test from "node:test";
import assert from "node:assert/strict";
import {
  buildNpcSocialSurfacePacketCompact,
  buildPeerRelationalCuesForNpc,
  buildRelationalPerformativeLine,
} from "./npcSocialSurfacePackets";
import { NPC_RELATIONAL_SURFACE_EDGES } from "@/lib/registry/npcRelationalSurface";

test("同场两人有边则产出 social surface packet", () => {
  const p = buildNpcSocialSurfacePacketCompact(["N-001", "N-004"], 3);
  assert.ok(p);
  assert.equal(p!.schema, 1);
  assert.ok(p!.lines.length >= 1);
  assert.ok(p!.lines[0]!.includes("陈婆婆") || p!.lines[0]!.includes("阿花"));
});

test("无第二人则无 packet", () => {
  assert.equal(buildNpcSocialSurfacePacketCompact(["N-001"], 3), null);
});

test("buildPeerRelationalCuesForNpc 指向具体熟人", () => {
  const s = buildPeerRelationalCuesForNpc("N-001", ["N-004", "N-999"]);
  assert.ok(s.includes("阿花"));
});

test("表面边表非空且成对", () => {
  assert.ok(NPC_RELATIONAL_SURFACE_EDGES.length >= 8);
  for (const e of NPC_RELATIONAL_SURFACE_EDGES) {
    assert.ok(e.a && e.b);
    assert.notEqual(e.a, e.b);
  }
});

test("表演行有长度上限", () => {
  const line = buildRelationalPerformativeLine(NPC_RELATIONAL_SURFACE_EDGES[0]!);
  assert.ok(line.length <= 125);
});
