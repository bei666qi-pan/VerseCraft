/** Verify that the runtime NPC roster is projected from canonical registry data. */
import { NPCS } from "../src/lib/registry/npcs";
import { NPC_ALIASES } from "../src/lib/registry/npcAliases";
import { buildNpcConsistencyBoundaryCompactBlock } from "../src/lib/playRealtime/npcConsistencyBoundaryPackets";

const location = "1F_Lobby";
const missing = NPCS.filter((npc) => {
  const boundary = buildNpcConsistencyBoundaryCompactBlock({
    playerContext: `用户位置[${location}]。\nNPC当前位置：${npc.id}@${location}。`,
    latestUserInput: "",
    playerLocation: location,
    focusNpcId: npc.id,
    maxRevealRank: 0,
    epistemic: { actorKnownFactCount: 0, publicFactCount: 0, forbiddenFactCount: 0 },
    maxChars: 10_000,
  });
  const payload = JSON.parse(boundary.text.split("\n")[1] ?? "{}") as {
    public_npc_roster_packet?: { items?: Array<{ id: string; name: string }> };
  };
  return !payload.public_npc_roster_packet?.items?.some(
    (item) => item.id === npc.id && item.name === npc.name,
  );
});
const invalidAliasIds = Object.keys(NPC_ALIASES).filter((id) => !NPCS.some((npc) => npc.id === id));

if (missing.length > 0 || invalidAliasIds.length > 0) {
  console.error("❌ verify-canonical-name-prompt: runtime roster drift detected");
  if (missing.length > 0) console.error("  missing/mismatched ids:", missing.map((npc) => npc.id).join(", "));
  if (invalidAliasIds.length > 0) console.error("  aliases without canonical NPC:", invalidAliasIds.join(", "));
  process.exit(1);
}

console.log(
  `✅ verify-canonical-name-prompt: ${NPCS.length} NPC names projected from canonical registry`,
);
if (Object.keys(NPC_ALIASES).length > 0) {
  const totalAliases = Object.values(NPC_ALIASES).flat().length;
  console.log(`   (${totalAliases} aliases in NPC_ALIASES — see npcAliases.ts)`);
}
