import { createHash } from "node:crypto";
import { ANOMALIES } from "@/lib/registry/anomalies";
import { NPCS } from "@/lib/registry/npcs";
import { APARTMENT_RULES } from "@/lib/registry/rules";
import { MAP_ROOMS } from "@/lib/registry/world";
import { normalizeForHash } from "@/lib/kg/normalize";
import { DEFAULT_RETRIEVAL_BUDGET } from "../constants";
import type { RetrievalIntentType, RetrievalPlan, RuntimeLoreRequest } from "../types";
import { inferMaxRevealRank } from "../reveal/revealGate";

function addIfIncludes(target: Set<string>, text: string, tests: string[]): void {
  for (const t of tests) {
    if (text.includes(t.toLowerCase())) target.add(t);
  }
}

function collectFloorHints(normalizedInput: string): string[] {
  const out = new Set<string>();
  const floors = ["b2", "b1", "1楼", "2楼", "3楼", "4楼", "5楼", "6楼", "7楼", "1f", "2f", "3f", "4f", "5f", "6f", "7f"];
  addIfIncludes(out, normalizedInput, floors);
  return [...out];
}

function collectLocationHints(normalizedInput: string): string[] {
  const out = new Set<string>();
  const allRooms = new Set<string>();
  for (const rooms of Object.values(MAP_ROOMS)) {
    for (const room of rooms) allRooms.add(room.toLowerCase());
  }
  addIfIncludes(out, normalizedInput, [...allRooms]);
  return [...out];
}

function collectEntityHints(normalizedInput: string): { exactCodes: string[]; exactCanonicalNames: string[]; tagHints: string[] } {
  const exactCodes = new Set<string>();
  const exactCanonicalNames = new Set<string>();
  const tagHints = new Set<string>();

  for (const npc of NPCS) {
    if (normalizedInput.includes(npc.id.toLowerCase()) || normalizedInput.includes(npc.name.toLowerCase())) {
      exactCodes.add(`npc:${npc.id}`);
      exactCanonicalNames.add(npc.id.toLowerCase());
      tagHints.add("npc");
      tagHints.add(npc.floor.toLowerCase());
    }
  }
  for (const anomaly of ANOMALIES) {
    if (normalizedInput.includes(anomaly.id.toLowerCase()) || normalizedInput.includes(anomaly.name.toLowerCase())) {
      exactCodes.add(`anomaly:${anomaly.id}`);
      exactCanonicalNames.add(anomaly.id.toLowerCase());
      tagHints.add("anomaly");
      tagHints.add(anomaly.floor.toLowerCase());
    }
  }
  return {
    exactCodes: [...exactCodes],
    exactCanonicalNames: [...exactCanonicalNames],
    tagHints: [...tagHints],
  };
}

function detectIntents(normalizedInput: string): RetrievalIntentType[] {
  const intents = new Set<RetrievalIntentType>();
  if (/(规则|守则|禁忌|残页|传闻|入住须知|暗月|出口|真相|13楼|13层)/.test(normalizedInput)) intents.add("rule");
  if (/(谁|npc|诡异|关系|好感|角色|居民|老人|经理|医生|保安)/.test(normalizedInput)) intents.add("character");
  if (/(房间|楼层|走廊|门厅|地点|在哪|位置|去|地图)/.test(normalizedInput)) intents.add("scene");
  if (/(我|我的|记得|之前|曾经|私有|个人)/.test(normalizedInput)) intents.add("private");
  if (/(传闻|共享|大家|公共|世界观|设定)/.test(normalizedInput)) intents.add("shared");
  if (intents.size === 0) intents.add("shared");
  return [...intents];
}

function buildFingerprint(
  input: RuntimeLoreRequest,
  normalizedInput: string,
  locationHints: string[],
  exactCodes: string[],
  maxRevealRank: number,
  metadata: {
    actorNpcId?: string | null;
    presentNpcIds: string[];
    locationId?: string | null;
    activeTaskIds: string[];
    threatLevel?: string | null;
    scenePressure?: string | null;
    playerKnownFactIds: string[];
  }
): string {
  const body = [
    normalizedInput,
    input.userId ?? "anon",
    input.sessionId ?? "anon",
    input.playerLocation ?? "unknown",
    input.taskType,
    input.worldScope.join(","),
    input.recentlyEncounteredEntities.join(","),
    locationHints.join(","),
    exactCodes.join(","),
    String(maxRevealRank),
    metadata.actorNpcId ?? "",
    metadata.presentNpcIds.join(","),
    metadata.locationId ?? "",
    metadata.activeTaskIds.join(","),
    metadata.threatLevel ?? "",
    metadata.scenePressure ?? "",
    metadata.playerKnownFactIds.join(","),
  ].join("|");
  return createHash("sha256").update(body).digest("hex");
}

function collectNpcIdsFromText(value: string | null | undefined): string[] {
  const text = String(value ?? "");
  return [...new Set(text.match(/N-\d{3}/g) ?? [])];
}

function collectActiveTaskIdsFromContext(value: string | null | undefined): string[] {
  const text = String(value ?? "");
  const ids = new Set<string>();
  for (const match of text.matchAll(/(?:task|任务|taskId|id)[:=]?\s*([a-zA-Z0-9_.:-]{3,80})/g)) {
    const id = match[1]?.trim();
    if (id && !id.startsWith("http")) ids.add(id);
  }
  return [...ids].slice(0, 24);
}

export function planWorldKnowledgeQuery(input: RuntimeLoreRequest): RetrievalPlan {
  const normalizedInput = normalizeForHash(input.latestUserInput);
  const maxRevealRank = inferMaxRevealRank(input.playerContext, input.playerLocation);
  const floorHints = collectFloorHints(normalizedInput);
  const locationHints = collectLocationHints(normalizedInput);
  const entityHints = collectEntityHints(normalizedInput);
  const intents = detectIntents(normalizedInput);
  const tagHints = new Set<string>(entityHints.tagHints);
  const presentNpcIds = input.presentNpcIds?.length
    ? input.presentNpcIds
    : [...new Set([...collectNpcIdsFromText(input.playerContext), ...input.recentlyEncounteredEntities.filter((id) => /^N-\d{3}$/.test(id))])];
  const activeTaskIds = input.activeTaskIds?.length ? input.activeTaskIds : collectActiveTaskIdsFromContext(input.playerContext);
  const locationId = input.locationId ?? input.playerLocation;
  const playerKnownFactIds = input.playerKnownFactIds ?? [];

  for (const f of floorHints) tagHints.add(f.replace("楼", "").replace("f", ""));
  if (intents.includes("rule")) {
    tagHints.add("survival_note");
    tagHints.add("rumor");
  }
  if (intents.includes("scene")) tagHints.add("location");
  if (intents.includes("character")) tagHints.add("npc");
  if (intents.includes("shared")) tagHints.add("core");
  if (APARTMENT_RULES.some((r) => normalizedInput.includes(r.slice(0, 4).toLowerCase()))) {
    tagHints.add("survival_note");
  }

  const ftsQuery = normalizedInput.slice(0, 512);
  const retrievalBudget = {
    ...DEFAULT_RETRIEVAL_BUDGET,
    maxFacts: Math.max(6, Math.min(DEFAULT_RETRIEVAL_BUDGET.maxFacts, Math.floor(input.tokenBudget / 35))),
  };
  const fingerprint = buildFingerprint(input, normalizedInput, locationHints, entityHints.exactCodes, maxRevealRank, {
    actorNpcId: input.actorNpcId,
    presentNpcIds,
    locationId,
    activeTaskIds,
    threatLevel: input.threatLevel,
    scenePressure: input.scenePressure,
    playerKnownFactIds,
  });
  const entitiesFingerprint = createHash("sha256")
    .update([...entityHints.exactCodes, ...input.recentlyEncounteredEntities].sort().join("|"))
    .digest("hex");

  return {
    intents,
    exactCodes: entityHints.exactCodes,
    exactCanonicalNames: entityHints.exactCanonicalNames,
    floorHints,
    locationHints,
    tagHints: [...tagHints],
    maxRevealRank,
    actorNpcId: input.actorNpcId,
    presentNpcIds,
    locationId,
    activeTaskIds,
    threatLevel: input.threatLevel,
    scenePressure: input.scenePressure,
    playerKnownFactIds,
    ftsQuery,
    scope: input.worldScope,
    tokenBudget: input.tokenBudget,
    retrievalBudget,
    fingerprint,
    entitiesFingerprint,
  };
}
