import assert from "node:assert/strict";
import test from "node:test";
import { serializeRuntimePacketsWithinBudget } from "./runtimeContextPackets";

function parseLastJson(text: string): Record<string, unknown> {
  const line = text.trim().split("\n").at(-1) ?? "";
  return JSON.parse(line) as Record<string, unknown>;
}

test("runtime packet budget never slices JSON and keeps earlier authority packets", () => {
  const text = serializeRuntimePacketsWithinBudget({
    prefixBlocks: ["authority"], maxChars: 120,
    packets: { location: { id: "3F" }, threat: { id: "A-3F" }, giant_optional: { text: "x".repeat(500) }, tail: { ok: true } },
  });
  assert.ok(text.length <= 300); // helper enforces the production safety floor
  const parsed = parseLastJson(text);
  assert.deepEqual(parsed.location, { id: "3F" });
  assert.deepEqual(parsed.threat, { id: "A-3F" });
  assert.equal(parsed.giant_optional, undefined);
  assert.deepEqual(parsed.tail, { ok: true });
});

test("runtime packet budget emits valid JSON at production-sized cap", () => {
  const text = serializeRuntimePacketsWithinBudget({ prefixBlocks: ["header"], maxChars: 4000, packets: { core: { value: "中".repeat(3900) }, optional: { value: "y".repeat(1000) } } });
  assert.ok(text.length <= 4000);
  assert.doesNotThrow(() => parseLastJson(text));
});

test("serializeRuntimePacketsWithinBudget keeps required packets after compacting forge payload", () => {
  const text = serializeRuntimePacketsWithinBudget({
    prefixBlocks: ["ctx"],
    maxChars: 1300,
    requiredPacketIds: ["main_threat_packet", "survival_loop_packet", "relationship_loop_packet", "investigation_loop_packet", "forge_packet"],
    packets: {
      main_threat_packet: { threats: [{ id: "A-001", state: "active", pressure: 22 }] },
      survival_loop_packet: { cycle: "survival", pressure: 0.7 },
      relationship_loop_packet: { relationships: [{ npcId: "N-001", drift: 2 }] },
      investigation_loop_packet: { clues: [{ name: "floor_7f", confidence: 0.9 }] },
      forge_packet: {
        availableAtCurrentLocation: true,
        operations: [
          { name: "op-1", description: "x".repeat(240) },
          { name: "op-2", description: "y".repeat(240) },
          { name: "op-3", description: "z".repeat(240) },
          { name: "op-4", description: "w".repeat(240) },
          { name: "op-5", description: "q".repeat(240) },
        ],
        availableMods: ["a", "b", "c", "d", "e", "f"],
        availableInfusions: ["i1", "i2", "i3", "i4", "i5", "i6"],
        recommendation: "a".repeat(120),
      },
    },
  });

  const parsed = parseLastJson(text);
  assert.equal(parsed.main_threat_packet !== undefined, true);
  assert.equal(parsed.survival_loop_packet !== undefined, true);
  assert.equal(parsed.relationship_loop_packet !== undefined, true);
  assert.equal(parsed.investigation_loop_packet !== undefined, true);
  assert.equal(parsed.forge_packet !== undefined, true);
  assert.ok(Array.isArray((parsed.forge_packet as Record<string, unknown>).operations));
  assert.ok(((parsed.forge_packet as Record<string, unknown>).operations as unknown[]).length <= 3);
  assert.ok(typeof (parsed.forge_packet as Record<string, unknown>).recommendation === "string");
  assert.ok(((parsed.forge_packet as Record<string, unknown>).recommendation as string).length <= 12);
  assert.ok(text.length <= 1300);
});
