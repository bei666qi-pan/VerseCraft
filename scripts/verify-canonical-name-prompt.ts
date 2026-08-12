/** Verify the current runtime-packet canonical-name contract. */
import assert from "node:assert/strict";
import { NPCS } from "../src/lib/registry/npcs";
import { NPC_ALIASES } from "../src/lib/registry/npcAliases";
import { buildStablePlayerDmSystemLines } from "../src/lib/playRealtime/playerChatSystemPrompt";
import { buildNpcConsistencyBoundaryCompactBlock } from "../src/lib/playRealtime/npcConsistencyBoundaryPackets";

const npcById = new Map(NPCS.map((npc) => [npc.id, npc]));
for (const [npcId, aliases] of Object.entries(NPC_ALIASES)) {
  assert.ok(npcById.has(npcId), `NPC_ALIASES references unknown id ${npcId}`);
  assert.equal(new Set(aliases).size, aliases.length, `duplicate alias for ${npcId}`);
}

const sample = NPCS.slice(0, 2);
assert.equal(sample.length, 2, "canonical registry must contain sample NPCs");
const playerContext = [
  "用户位置[1F_Lobby]。",
  `NPC当前位置：${sample.map((npc) => `${npc.id}@1F_Lobby`).join("，")}。`,
].join("\n");
const packet = buildNpcConsistencyBoundaryCompactBlock({
  playerContext,
  latestUserInput: "",
  playerLocation: "1F_Lobby",
  focusNpcId: sample[0]!.id,
  maxRevealRank: 0,
  epistemic: { actorKnownFactCount: 0, publicFactCount: 0, forbiddenFactCount: 0 },
});
const payload = JSON.parse(packet.text.split("\n")[1]!) as {
  public_npc_roster_packet?: { items?: Array<{ id: string; name: string }> };
};
assert.deepEqual(
  payload.public_npc_roster_packet?.items,
  sample.map((npc) => ({ id: npc.id, name: npc.name, loc: "1F_Lobby" })),
  "runtime public roster must use canonical registry ids and names",
);

const stablePrompt = buildStablePlayerDmSystemLines().join("\n");
assert.ok(!stablePrompt.includes("NPC 规范名册"), "stable prompt must not duplicate the full runtime roster");

console.log(`✅ canonical runtime packet verified for ${NPCS.length} NPCs and ${Object.values(NPC_ALIASES).flat().length} aliases`);
