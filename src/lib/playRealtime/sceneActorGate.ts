import { locationsMatch, normalizeLocationKey } from "@/lib/registry/npcCanonBuilders";

export type SceneNpcMode =
  | "present"
  | "target_present"
  | "heard_only"
  | "memory_only"
  | "remote_contact"
  | "forbidden";

export type SceneActorGateResult = {
  schema: "scene_actor_gate_v1";
  currentLocation: string | null;
  focusNpcId: string | null;
  presentNpcIds: string[];
  canSpeakNpcIds: string[];
  mentionedNpcIds: string[];
  offscreenNpcIds: string[];
  memoryOnlyNpcIds: string[];
  forbiddenNpcIds: string[];
  modeByNpcId: Record<string, SceneNpcMode>;
  ambiguity: {
    multiPresentNoFocus: boolean;
    reason: string | null;
  };
  compactRules: string[];
};

export type CompactSceneActorGatePacket = {
  f: string | null;
  loc: string | null;
  p: string[];
  s: string[];
  m: Record<string, string>;
  amb: 0 | 1;
  rule: string;
};

const NPC_ID_RE = /\b(N-\d{3})\b/gi;
const NPC_POSITION_RE = /\b(N-\d{3})@([A-Za-z0-9_]+)\b/gi;
const LOCATION_IN_BRACKETS_RE =
  /(?:用户位置|player_location|playerLocation|currentLocation)\s*\[([^\]]+)\]/i;
const SCENE_NPC_MODE_CODES: Record<SceneNpcMode, string> = {
  present: "p",
  target_present: "tp",
  heard_only: "h",
  memory_only: "mem",
  remote_contact: "rc",
  forbidden: "x",
};

function normalizeNpcId(raw: string | null | undefined): string | null {
  const t = String(raw ?? "").trim();
  const m = t.match(/^N-(\d{3})$/i);
  return m ? `N-${m[1]}` : null;
}

function pushUnique<T>(list: T[], value: T): void {
  if (!list.includes(value)) list.push(value);
}

function extractNpcIds(text: string | null | undefined): string[] {
  const out: string[] = [];
  for (const match of String(text ?? "").matchAll(NPC_ID_RE)) {
    const id = normalizeNpcId(match[1]);
    if (id) pushUnique(out, id);
  }
  return out;
}

function extractNpcIdsFromHints(hints: readonly string[] | null | undefined): string[] {
  const out: string[] = [];
  for (const hint of hints ?? []) {
    for (const id of extractNpcIds(hint)) pushUnique(out, id);
  }
  return out;
}

function resolveCurrentLocation(playerContext: string, fallback: string | null): string | null {
  const fromContext = playerContext.match(LOCATION_IN_BRACKETS_RE)?.[1]?.trim();
  const raw = fromContext || fallback?.trim() || "";
  return raw ? normalizeLocationKey(raw) : null;
}

function parseNpcPositions(playerContext: string): Array<{ npcId: string; location: string }> {
  const out: Array<{ npcId: string; location: string }> = [];
  const seen = new Set<string>();
  for (const match of playerContext.matchAll(NPC_POSITION_RE)) {
    const npcId = normalizeNpcId(match[1]);
    const location = normalizeLocationKey(match[2] ?? "");
    if (!npcId || !location || seen.has(npcId)) continue;
    seen.add(npcId);
    out.push({ npcId, location });
  }
  return out;
}

function isAtCurrentLocation(npcLocation: string, currentLocation: string | null): boolean {
  if (!currentLocation || !npcLocation) return false;
  return locationsMatch(npcLocation, currentLocation);
}

export function buildSceneActorGate(args: {
  playerContext: string;
  latestUserInput: string;
  playerLocation: string | null;
  controlTarget?: string | null;
  relationshipHints?: string[];
  remoteContactNpcIds?: string[];
}): SceneActorGateResult {
  const playerContext = String(args.playerContext ?? "");
  const currentLocation = resolveCurrentLocation(playerContext, args.playerLocation);
  const npcPositions = parseNpcPositions(playerContext);
  const mentionedNpcIds = extractNpcIds(args.latestUserInput);
  const hintedNpcIds = extractNpcIdsFromHints(args.relationshipHints);
  const remoteNpcIds = (args.remoteContactNpcIds ?? [])
    .map((id) => normalizeNpcId(id))
    .filter((id): id is string => Boolean(id));
  const controlTarget = normalizeNpcId(args.controlTarget);

  const presentNpcIds: string[] = [];
  const knownOffscreenNpcIds: string[] = [];
  const knownIds: string[] = [];
  for (const row of npcPositions) {
    pushUnique(knownIds, row.npcId);
    if (isAtCurrentLocation(row.location, currentLocation)) {
      pushUnique(presentNpcIds, row.npcId);
    } else {
      pushUnique(knownOffscreenNpcIds, row.npcId);
    }
  }

  const presentSet = new Set(presentNpcIds);
  const mentionedSet = new Set(mentionedNpcIds);
  const remoteSet = new Set(remoteNpcIds);
  const hintedSet = new Set(hintedNpcIds);

  const controlFocus =
    controlTarget && presentSet.has(controlTarget) ? controlTarget : null;
  const mentionedPresentNpcIds = mentionedNpcIds.filter((id) => presentSet.has(id));
  const focusNpcId =
    controlFocus ??
    mentionedPresentNpcIds[0] ??
    (mentionedNpcIds.length === 0 && presentNpcIds.length === 1 ? presentNpcIds[0]! : null);

  const multiPresentNoFocus = !focusNpcId && presentNpcIds.length > 1;
  const modeByNpcId: Record<string, SceneNpcMode> = {};
  const relevantNpcIds: string[] = [];
  for (const id of knownIds) pushUnique(relevantNpcIds, id);
  for (const id of mentionedNpcIds) pushUnique(relevantNpcIds, id);
  for (const id of hintedNpcIds) pushUnique(relevantNpcIds, id);
  for (const id of remoteNpcIds) pushUnique(relevantNpcIds, id);
  if (controlTarget) pushUnique(relevantNpcIds, controlTarget);

  for (const id of relevantNpcIds) {
    if (presentSet.has(id)) {
      modeByNpcId[id] =
        id === focusNpcId || id === controlFocus || mentionedSet.has(id)
          ? "target_present"
          : "present";
      continue;
    }
    if (remoteSet.has(id)) {
      modeByNpcId[id] = "remote_contact";
      continue;
    }
    if (mentionedSet.has(id)) {
      modeByNpcId[id] = "heard_only";
      continue;
    }
    if (hintedSet.has(id)) {
      modeByNpcId[id] = "memory_only";
      continue;
    }
    modeByNpcId[id] = "forbidden";
  }

  const canSpeakNpcIds: string[] = [];
  for (const id of relevantNpcIds) {
    const mode = modeByNpcId[id];
    if (mode === "present" || mode === "target_present" || mode === "remote_contact") {
      pushUnique(canSpeakNpcIds, id);
    }
  }

  const offscreenNpcIds: string[] = [];
  for (const id of relevantNpcIds) {
    if (!presentSet.has(id)) pushUnique(offscreenNpcIds, id);
  }

  const memoryOnlyNpcIds = relevantNpcIds.filter((id) => modeByNpcId[id] === "memory_only");
  const forbiddenNpcIds = relevantNpcIds.filter((id) => modeByNpcId[id] === "forbidden");

  return {
    schema: "scene_actor_gate_v1",
    currentLocation,
    focusNpcId,
    presentNpcIds,
    canSpeakNpcIds,
    mentionedNpcIds,
    offscreenNpcIds,
    memoryOnlyNpcIds,
    forbiddenNpcIds,
    modeByNpcId,
    ambiguity: {
      multiPresentNoFocus,
      reason: multiPresentNoFocus ? "multiple_present_without_focus" : null,
    },
    compactRules: [
      "present/target_present NPCs may speak in the current scene.",
      "heard_only NPCs may be sensed or rumored but must not speak directly.",
      "memory_only NPCs may appear only as memory or codex recall.",
      "remote_contact may speak only through the active remote channel; forbidden never speaks.",
    ],
  };
}

export function compactSceneActorGatePacket(
  gate: SceneActorGateResult,
  maxChars = 1000
): CompactSceneActorGatePacket {
  const build = (presentMax: number, speakMax: number, modeMax: number, rule: string): CompactSceneActorGatePacket => ({
    f: gate.focusNpcId,
    loc: gate.currentLocation ? gate.currentLocation.slice(0, 80) : null,
    p: gate.presentNpcIds.slice(0, presentMax),
    s: gate.canSpeakNpcIds.slice(0, speakMax),
    m: Object.fromEntries(
      Object.entries(gate.modeByNpcId)
        .slice(0, modeMax)
        .map(([id, mode]) => [id, SCENE_NPC_MODE_CODES[mode]])
    ),
    amb: gate.ambiguity.multiPresentNoFocus ? 1 : 0,
    rule,
  });

  for (const packet of [
    build(6, 6, 10, "focus=explicit/single; offscreen_no_speak; remote_ok"),
    build(4, 4, 6, "explicit/single focus; offscreen no speak"),
    build(3, 3, 4, "scene gate"),
  ]) {
    if (JSON.stringify(packet).length <= maxChars) return packet;
  }

  return build(2, 2, 0, "scene gate");
}
