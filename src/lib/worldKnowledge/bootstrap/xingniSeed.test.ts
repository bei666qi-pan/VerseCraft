import assert from "node:assert/strict";
import test from "node:test";
import { QINGSHI_ENEMIES, QINGSHI_LOCATIONS, QINGSHI_NPCS } from "@/lib/worlds/xingni/qingshiContent";
import { QINGSHI_ITEMS, QINGSHI_MAIN_STAGES, QINGSHI_PRODUCTION_ENEMIES, QINGSHI_REPEATABLES } from "@/lib/worlds/xingni/qingshiProductionContent";
import { buildRegistryWorldKnowledgeDraft } from "./registryAdapters";

test("xingni fixed content is seeded with world and map scope", () => {
  const draft = buildRegistryWorldKnowledgeDraft();
  const scoped = draft.chunks.filter((chunk) => chunk.worldId === "xingni_taichu");
  assert.equal(scoped.length, Object.keys(QINGSHI_LOCATIONS).length + QINGSHI_NPCS.length + QINGSHI_ENEMIES.length + QINGSHI_PRODUCTION_ENEMIES.length + QINGSHI_MAIN_STAGES.length + QINGSHI_REPEATABLES.length + Object.keys(QINGSHI_ITEMS).length);
  assert.ok(scoped.every((chunk) => chunk.mapId === "xingni_qingshi_county"));
  assert.ok(scoped.every((chunk) => chunk.entityCode.startsWith("xingni:")));
  assert.ok(scoped.some((chunk) => chunk.content.includes("顾玄岳")));
  assert.ok(scoped.some((chunk) => chunk.content.includes("归雁客栈")));
  assert.ok(scoped.some((chunk) => chunk.content.includes("四时段日程")));
  assert.ok(scoped.some((chunk) => chunk.content.includes("XQ-M14")));
  assert.ok(scoped.every((chunk) => !/如月公寓|原石|B1/.test(chunk.content)));
});

test("legacy registry chunks remain explicitly defaultable to dark moon", () => {
  const draft = buildRegistryWorldKnowledgeDraft();
  const apartment = draft.chunks.find((chunk) => chunk.entityCode === "truth:apartment");
  assert.ok(apartment);
  assert.equal(apartment.worldId, undefined);
  assert.equal(apartment.mapId, undefined);
});
