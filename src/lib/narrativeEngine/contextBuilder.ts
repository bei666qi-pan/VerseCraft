import { getChapterDefinition, normalizeChapterState } from "@/lib/chapters";
import type { ChapterState } from "@/lib/chapters/types";
import { CONTENT_PACKS } from "@/lib/contentSpec/packs";
import { coerceToEpistemicMemory, type SessionMemoryRow } from "@/lib/memoryCompress";
import {
  selectChapterMustEchoEntries,
  selectOpenChapterThreads,
} from "@/lib/memorySpine/selectors";
import type { MemorySpineEntry, MemorySpineState } from "@/lib/memorySpine/types";
import { buildNpcHeartRuntimeView } from "@/lib/npcHeart/selectors";
import { getNpcCanonicalIdentity, isRegisteredCanonicalNpcId } from "@/lib/registry/npcCanon";
import { ANOMALIES } from "@/lib/registry/anomalies";
import { ITEMS } from "@/lib/registry/items";
import { NPCS } from "@/lib/registry/npcs";
import { WAREHOUSE_ITEMS } from "@/lib/registry/warehouseItems";
import type { RunSnapshotV2 } from "@/lib/state/snapshot/types";
import { buildChapterWriterInstruction } from "@/lib/storyDirector/chapterReasoner";
import type { LoreFact, LorePacket, RuntimeLoreRequest } from "@/lib/worldKnowledge/types";
import { writeNarrativeRunBestEffort } from "./narrativeRunRepository";
import {
  readRecentNpcMemoriesBestEffort,
  type NpcMemoryContextRecord,
  type NpcMemoryReadInput,
} from "./npcMemoryRepository";
import {
  readRecentStoryEventsBestEffort,
  type RecentStoryEventRecord,
  type StoryEventReadInput,
} from "./storyEventRepository";
import type { DialogueContext, NarrativeTurnContext, NarrativeTurnInput } from "./types";

export type BuildDialogueContextInput = NarrativeTurnInput & {
  turnIndex?: number | null;
  worldId?: string | null;
  sceneId?: string | null;
  activeNpcId?: string | null;
  revealTier?: number | null;
  runSnapshotV2?: RunSnapshotV2 | null;
  chapterState?: ChapterState | null;
  storyDirector?: unknown | null;
  sessionMemory?: SessionMemoryRow | null;
  lorePacket?: LorePacket | null;
  recentlyEncounteredEntities?: string[];
  deps?: Partial<DialogueContextBuilderDeps>;
};

export type DialogueContextBuilderDeps = {
  loadSessionMemoryForUser: (userId: string) => Promise<SessionMemoryRow | null>;
  loadWorldLore: (request: RuntimeLoreRequest) => Promise<LorePacket>;
  loadRecentStoryEvents: (input: StoryEventReadInput) => Promise<RecentStoryEventRecord[]>;
  loadNpcMemories: (input: NpcMemoryReadInput) => Promise<NpcMemoryContextRecord[]>;
  buildNpcHeartRuntimeView: typeof buildNpcHeartRuntimeView;
  recordDegrade: (input: {
    requestId: string;
    sessionId: string | null;
    userId: string | null;
    turnIndex: number;
    reasons: string[];
  }) => Promise<unknown>;
};

export function buildNarrativeTurnContext(input: NarrativeTurnInput): NarrativeTurnContext {
  return {
    requestId: input.requestId,
    sessionId: input.sessionId,
    userId: input.userId,
    latestUserInput: String(input.latestUserInput ?? "").trim(),
    messageCount: Array.isArray(input.messages) ? input.messages.length : 0,
    playerContextChars: String(input.playerContext ?? "").length,
    clientPurpose: input.clientPurpose ?? null,
    hasClientState: input.clientState !== null && input.clientState !== undefined,
  };
}

export function summarizeNarrativeTurnContext(input: NarrativeTurnInput) {
  const context = buildNarrativeTurnContext(input);
  return {
    requestId: context.requestId,
    sessionId: context.sessionId,
    userId: context.userId,
    messageCount: context.messageCount,
    latestUserInputChars: context.latestUserInput.length,
    playerContextChars: context.playerContextChars,
    clientPurpose: context.clientPurpose,
    phase: "transitional_shell" as const,
    handledBy: "api_chat_route" as const,
  };
}

export async function buildDialogueContext(input: BuildDialogueContextInput): Promise<DialogueContext> {
  const deps = resolveDialogueContextDeps(input.deps);
  const degradeReasons: string[] = [];

  try {
    const snapshot = getRunSnapshot(input);
    const clientState = asRecord(input.clientState);
    const turnIndex = normalizeInt(input.turnIndex ?? clientState?.turnIndex, 0);
    const context = createMinimalDialogueContext(input, snapshot);

    let sessionMemory: SessionMemoryRow | null = input.sessionMemory ?? null;
    if (!sessionMemory && input.userId) {
      try {
        sessionMemory = await deps.loadSessionMemoryForUser(input.userId);
      } catch {
        degradeReasons.push("session_memory_read_failed");
      }
    }
    context.rawCompatibility.sessionMemory = sessionMemory ?? undefined;

    const epistemicMemory = safeCoerceSessionMemory(sessionMemory, degradeReasons);
    applyPlayerContext(context, {
      snapshot,
      clientState,
      epistemicMemory,
    });

    applyChapterContext(context, {
      snapshot,
      clientState,
      chapterState: input.chapterState,
      storyDirector: input.storyDirector,
      sceneId: input.sceneId,
    });

    const revealTier = normalizeRevealTier(input.revealTier);
    context.world.revealTier = revealTier;

    const presentNpcIds = collectPresentNpcIds({ snapshot, clientState, locationId: context.player.locationId });
    const activeNpcId = chooseActiveNpcId({
      requestedNpcId: input.activeNpcId,
      presentNpcIds,
      snapshot,
    });

    const lorePacket = await resolveLorePacket({
      input,
      deps,
      locationId: context.player.locationId,
      recentlyEncounteredEntities: uniqueStrings([
        ...(input.recentlyEncounteredEntities ?? []),
        ...presentNpcIds,
        ...context.player.inventoryIds,
      ]).slice(0, 48),
      degradeReasons,
    });
    const loreFacts = flattenLorePacketFacts(lorePacket);
    context.world.loreFacts = loreFacts.map((fact) => ({
      factKey: fact.identity.factKey,
      canonicalText: fact.canonicalText,
      layer: fact.layer,
      tags: fact.tags,
    }));
    context.world.hardRules = loreFacts
      .filter((fact) => fact.factType === "rule")
      .map((fact) => fact.canonicalText)
      .filter(Boolean)
      .slice(0, 12);
    context.world.allowedEntityIds = collectAllowedEntityIds({
      snapshot,
      clientState,
      loreFacts,
      activeNpcId,
      memorySpine: snapshot?.memory?.spine ?? null,
    });
    context.world.forbiddenFactIds = collectForbiddenFactIds({
      activeNpcId,
      epistemicMemory,
      revealTier,
    });

    context.activeNpc = buildActiveNpcContext({
      activeNpcId,
      deps,
      snapshot,
      locationId: context.player.locationId,
      presentNpcIds,
      revealTier,
      epistemicMemory,
      forbiddenFactIds: context.world.forbiddenFactIds,
      degradeReasons,
    });

    context.recentEvents = await loadRecentEvents({
      deps,
      input,
      degradeReasons,
    });
    context.npcMemories = await loadNpcMemories({
      deps,
      input,
      npcId: activeNpcId,
      degradeReasons,
    });

    if (degradeReasons.length > 0) {
      await recordDialogueContextDegrade(deps, {
        input,
        turnIndex,
        reasons: degradeReasons,
      });
    }

    return context;
  } catch {
    const fallback = createMinimalDialogueContext(input, getRunSnapshot(input));
    await recordDialogueContextDegrade(deps, {
      input,
      turnIndex: normalizeInt(input.turnIndex, 0),
      reasons: ["dialogue_context_build_failed"],
    });
    return fallback;
  }
}

function createMinimalDialogueContext(input: BuildDialogueContextInput, snapshot: RunSnapshotV2 | null): DialogueContext {
  return {
    requestId: input.requestId,
    sessionId: input.sessionId,
    userId: input.userId,
    player: {
      locationId: null,
      time: null,
      stats: {},
      inventoryIds: [],
      currentProfession: null,
      knownFactIds: [],
      discoveredClueIds: [],
    },
    chapter: {
      chapterId: null,
      title: null,
      status: null,
      sceneId: input.sceneId ?? null,
      phase: null,
      promise: null,
      mainQuestion: null,
      emotionalTone: null,
      mustEchoSummaries: [],
      unresolvedThreads: [],
      forbiddenRevealIds: [],
      closePolicy: null,
      writerInstruction: null,
      objective: null,
      completedBeatIds: [],
      allowedEventIds: [],
      blockedEventIds: [],
    },
    activeNpc: null,
    npcMemories: [],
    world: {
      worldId: input.worldId ?? "base_apartment",
      loreFacts: [],
      hardRules: [],
      allowedEntityIds: [],
      forbiddenFactIds: [],
      revealTier: normalizeRevealTier(input.revealTier),
    },
    recentEvents: [],
    rawCompatibility: {
      playerContext: input.playerContext,
      clientState: input.clientState,
      ...(snapshot ? { runSnapshotV2: snapshot } : {}),
    },
  };
}

function applyPlayerContext(
  context: DialogueContext,
  args: {
    snapshot: RunSnapshotV2 | null;
    clientState: Record<string, unknown> | null;
    epistemicMemory: ReturnType<typeof coerceToEpistemicMemory>;
  }
): void {
  const snapshot = args.snapshot;
  const clientState = args.clientState;
  const memoryStatus = asRecord(args.epistemicMemory?.player_status);

  context.player.locationId =
    stringOrNull(snapshot?.player?.currentLocation) ??
    stringOrNull(clientState?.playerLocation) ??
    stringOrNull(memoryStatus?.locationId) ??
    null;

  const snapshotTime = snapshot?.time
    ? { day: normalizeInt(snapshot.time.day, 0), hour: normalizeInt(snapshot.time.hour, 0) }
    : null;
  const clientTime = asRecord(clientState?.time);
  context.player.time =
    snapshotTime ??
    (clientTime
      ? { day: normalizeInt(clientTime.day, 0), hour: Math.max(0, Math.min(23, normalizeInt(clientTime.hour, 0))) }
      : null);

  context.player.stats = normalizeNumberRecord(snapshot?.player?.stats ?? clientState?.stats);
  context.player.inventoryIds = uniqueStrings([
    ...idsFromItems(snapshot?.player?.inventory),
    ...asStringArray(clientState?.inventoryItemIds),
  ]);
  context.player.currentProfession =
    stringOrNull(snapshot?.profession?.currentProfession) ??
    stringOrNull(clientState?.currentProfession) ??
    null;

  const memoryKnownFactIds = asStringArray(memoryStatus?.knownFactIds);
  const revealKnownFactIds = (args.epistemicMemory?.reveal_tier_sensitive_facts ?? [])
    .filter((fact) => fact.minRevealRank <= context.world.revealTier)
    .map((fact) => fact.id);
  const spineFactIds = (snapshot?.memory?.spine?.entries ?? [])
    .filter((entry) => entry.status === "active")
    .map((entry) => entry.id);
  context.player.knownFactIds = uniqueStrings([
    ...(snapshot?.world?.discoveredSecrets ?? []),
    ...memoryKnownFactIds,
    ...revealKnownFactIds,
    ...spineFactIds,
  ]);
  context.player.discoveredClueIds = uniqueStrings([
    ...(snapshot?.journal?.clues ?? []).map((clue) => clue.id),
    ...asStringArray(clientState?.journalClueIds),
  ]);
}

function applyChapterContext(
  context: DialogueContext,
  args: {
    snapshot: RunSnapshotV2 | null;
    clientState: Record<string, unknown> | null;
    chapterState?: ChapterState | null;
    storyDirector?: unknown | null;
    sceneId?: string | null;
  }
): void {
  const rawState = args.chapterState ?? args.snapshot?.chapterState ?? null;
  const directorChapter = resolveChapterDirectorPackage({
    explicitDirector: args.storyDirector,
    snapshot: args.snapshot,
    clientState: args.clientState,
  });
  if (!rawState) {
    context.chapter.sceneId = args.sceneId ?? context.player.locationId ?? null;
    if (directorChapter) {
      context.chapter = {
        ...context.chapter,
        chapterId: directorChapter.chapterId,
        title: directorChapter.title,
        sceneId: args.sceneId ?? context.player.locationId ?? null,
        phase: directorChapter.phase,
        promise: directorChapter.promise,
        mainQuestion: directorChapter.mainQuestion,
        emotionalTone: directorChapter.emotionalTone,
        mustEchoSummaries: buildMustEchoSummaries({
          memorySpine: getMemorySpine(args.snapshot),
          directorChapter,
        }),
        unresolvedThreads: buildUnresolvedThreadSummaries({
          memorySpine: getMemorySpine(args.snapshot),
          directorChapter,
        }),
        forbiddenRevealIds: directorChapter.forbiddenRevealIds,
        closePolicy: directorChapter.closePolicy,
        writerInstruction: directorChapter.writerInstruction,
        objective: directorChapter.mainQuestion ?? directorChapter.promise,
      };
    }
    return;
  }
  try {
    const chapterState = normalizeChapterState(rawState);
    const chapterId = chapterState.activeChapterId ?? chapterState.currentChapterId ?? null;
    const progress = chapterId ? chapterState.progressByChapterId?.[chapterId] : null;
    const definition = getChapterDefinition(chapterId);
    const completedBeatIds = uniqueStrings(progress?.completedBeatIds ?? []);
    const title = directorChapter?.title ?? definition?.title ?? null;
    const fallbackObjective = progress?.lastObjectiveText ?? definition?.objective ?? null;
    const mainQuestion = directorChapter?.mainQuestion ?? fallbackObjective;
    const promise = directorChapter?.promise ?? definition?.endHook ?? fallbackObjective;
    const memorySpine = getMemorySpine(args.snapshot);
    context.chapter = {
      chapterId,
      title,
      status: progress?.status ?? null,
      sceneId: args.sceneId ?? context.player.locationId ?? null,
      phase: directorChapter?.phase ?? null,
      promise,
      mainQuestion,
      emotionalTone: directorChapter?.emotionalTone ?? null,
      mustEchoSummaries: buildMustEchoSummaries({
        memorySpine,
        directorChapter,
        chapterId,
        chapterOrder: definition?.order ?? null,
      }),
      unresolvedThreads: buildUnresolvedThreadSummaries({
        memorySpine,
        directorChapter,
        chapterId,
        chapterOrder: definition?.order ?? null,
      }),
      forbiddenRevealIds: directorChapter?.forbiddenRevealIds ?? [],
      closePolicy: directorChapter?.closePolicy ?? null,
      writerInstruction:
        directorChapter?.writerInstruction ??
        (fallbackObjective ? `承接本章目标推进：${clipForContext(fallbackObjective, 120)}` : null),
      objective: mainQuestion,
      completedBeatIds,
      allowedEventIds: (definition?.beats ?? [])
        .map((beat) => beat.id)
        .filter((id) => !completedBeatIds.includes(id)),
      blockedEventIds: completedBeatIds,
    };
  } catch {
    context.chapter.sceneId = args.sceneId ?? context.player.locationId ?? null;
  }
}

type ChapterDirectorContext = {
  chapterId: string | null;
  chapterOrder: number | null;
  title: string | null;
  phase: string | null;
  rawPhase: string | null;
  promise: string | null;
  mainQuestion: string | null;
  emotionalTone: string | null;
  mustEchoMemoryIds: string[];
  openThreadIds: string[];
  forbiddenRevealIds: string[];
  closePolicy: string | null;
  writerInstruction: string | null;
};

function resolveChapterDirectorPackage(args: {
  explicitDirector?: unknown | null;
  snapshot: RunSnapshotV2 | null;
  clientState: Record<string, unknown> | null;
}): ChapterDirectorContext | null {
  const candidates = [
    asRecord(args.explicitDirector)?.chapter,
    asRecord(args.explicitDirector),
    asRecord(args.snapshot?.world?.storyDirector)?.chapter,
    asRecord(args.clientState?.storyDirector)?.chapter,
    asRecord(asRecord(args.clientState?.directorDigest)?.chapter),
  ];
  for (const raw of candidates) {
    const o = asRecord(raw);
    if (!o) continue;
    const chapterId = stringOrNull(o.currentChapterId) ?? stringOrNull(o.chapterId);
    const title = stringOrNull(o.chapterTitle) ?? stringOrNull(o.title);
    if (!chapterId && !title) continue;
    const rawPhase = normalizePhaseCode(o.chapterPhase ?? o.phase);
    const writerInstruction = rawPhase
      ? buildChapterWriterInstruction(rawPhase as any)
      : stringOrNull(o.writerInstruction);
    const closeCandidate = asRecord(o.closeCandidate);
    const shouldClose = closeCandidate?.shouldClose === true || o.shouldClose === true;
    const recap = stringOrNull(closeCandidate?.playerRecapCandidate);
    const nextTitle = stringOrNull(closeCandidate?.nextChapterTitleCandidate) ?? stringOrNull(o.nextTitle);
    return {
      chapterId,
      chapterOrder: normalizeOptionalPositiveInt(o.chapterOrder),
      title,
      rawPhase,
      phase: rawPhase ? phaseLabelForWriter(rawPhase) : null,
      promise: stringOrNull(o.promise),
      mainQuestion: stringOrNull(o.mainQuestion),
      emotionalTone: stringOrNull(o.emotionalTone),
      mustEchoMemoryIds: asStringArray(o.mustEchoMemoryIds).slice(0, 8),
      openThreadIds: asStringArray(o.openThreadIds).slice(0, 12),
      forbiddenRevealIds: asStringArray(o.forbiddenRevealIds).slice(0, 10),
      closePolicy: shouldClose
        ? [
            "可以写出自然的可读停顿，但不要写章末结算、奖励、损失、进度或系统说明。",
            recap ? `回望只可参考：${clipForContext(recap, 120)}` : "",
            nextTitle ? `下一章标题可作为方向感：${clipForContext(nextTitle, 40)}` : "",
          ].filter(Boolean).join(" ")
        : "本章仍由正文自然推进；不要主动宣布章节结束。",
      writerInstruction,
    };
  }
  return null;
}

function getMemorySpine(snapshot: RunSnapshotV2 | null): MemorySpineState {
  const spine = snapshot?.memory?.spine;
  if (spine && Array.isArray(spine.entries)) return spine;
  return { v: 1, entries: [] };
}

function buildMustEchoSummaries(args: {
  memorySpine: MemorySpineState;
  directorChapter: ChapterDirectorContext | null;
  chapterId?: string | null;
  chapterOrder?: number | null;
}): string[] {
  const entries = args.memorySpine.entries ?? [];
  const explicitIds = new Set(args.directorChapter?.mustEchoMemoryIds ?? []);
  const explicit = entries.filter((entry) => explicitIds.has(entry.id));
  const selected = selectChapterMustEchoEntries(args.memorySpine, {
    chapterId: args.directorChapter?.chapterId ?? args.chapterId ?? null,
    chapterOrder: args.directorChapter?.chapterOrder ?? args.chapterOrder ?? null,
    maxItems: 6,
  });
  return summarizeMemoryEntries([...explicit, ...selected], {
    forbiddenRevealIds: args.directorChapter?.forbiddenRevealIds ?? [],
    maxItems: 4,
    maxChars: 120,
  });
}

function buildUnresolvedThreadSummaries(args: {
  memorySpine: MemorySpineState;
  directorChapter: ChapterDirectorContext | null;
  chapterId?: string | null;
  chapterOrder?: number | null;
}): string[] {
  const entries = args.memorySpine.entries ?? [];
  const explicitIds = new Set(args.directorChapter?.openThreadIds ?? []);
  const explicit = entries.filter((entry) => explicitIds.has(entry.id));
  const selected = selectOpenChapterThreads(args.memorySpine, {
    chapterId: args.directorChapter?.chapterId ?? args.chapterId ?? null,
    chapterOrder: args.directorChapter?.chapterOrder ?? args.chapterOrder ?? null,
    maxItems: 8,
  });
  return summarizeMemoryEntries([...explicit, ...selected], {
    forbiddenRevealIds: args.directorChapter?.forbiddenRevealIds ?? [],
    maxItems: 6,
    maxChars: 120,
  });
}

function summarizeMemoryEntries(
  entries: MemorySpineEntry[],
  opts: { forbiddenRevealIds: string[]; maxItems: number; maxChars: number }
): string[] {
  const forbidden = new Set(opts.forbiddenRevealIds);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    if (!entry || entry.status === "expired") continue;
    const summary = writerSafeMemorySummary(entry, forbidden, opts.maxChars);
    if (!summary || seen.has(summary)) continue;
    seen.add(summary);
    out.push(summary);
    if (out.length >= opts.maxItems) break;
  }
  return out;
}

function writerSafeMemorySummary(entry: MemorySpineEntry, forbiddenRevealIds: Set<string>, maxChars: number): string {
  if (forbiddenRevealIds.has(entry.id)) {
    return `禁止直接揭露未解真相：${entry.id}`;
  }
  if (entry.kind === "secret_fragment") {
    return "有一枚未完全解开的秘密碎片靠近场面，只能以表层征兆回应。";
  }
  return clipForContext(entry.summary, maxChars);
}

function phaseLabelForWriter(phase: string): string | null {
  switch (phase) {
    case "opening":
      return "开篇承接";
    case "rising":
      return "铺陈推进";
    case "choice":
      return "选择临界";
    case "echo":
      return "选择回响";
    case "reveal":
      return "小幅揭露";
    case "aftershock":
      return "余波停顿";
    case "closing":
      return "自然收束";
    default:
      return null;
  }
}

function normalizePhaseCode(value: unknown): string | null {
  const phase = stringOrNull(value);
  if (
    phase === "opening" ||
    phase === "rising" ||
    phase === "choice" ||
    phase === "echo" ||
    phase === "reveal" ||
    phase === "aftershock" ||
    phase === "closing"
  ) {
    return phase;
  }
  return null;
}

function normalizeOptionalPositiveInt(value: unknown): number | null {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function clipForContext(value: unknown, max: number): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

async function resolveLorePacket(args: {
  input: BuildDialogueContextInput;
  deps: DialogueContextBuilderDeps;
  locationId: string | null;
  recentlyEncounteredEntities: string[];
  degradeReasons: string[];
}): Promise<LorePacket | null> {
  if (args.input.lorePacket) return args.input.lorePacket;
  try {
    return await args.deps.loadWorldLore({
      latestUserInput: args.input.latestUserInput,
      userId: args.input.userId,
      sessionId: args.input.sessionId,
      playerLocation: args.locationId,
      playerContext: args.input.playerContext,
      recentlyEncounteredEntities: args.recentlyEncounteredEntities,
      taskType: "PLAYER_CHAT",
      tokenBudget: 1200,
      worldScope: [
        "core",
        "shared",
        ...(args.input.userId ? (["user"] as const) : []),
        ...(args.input.sessionId ? (["session"] as const) : []),
      ],
    });
  } catch {
    args.degradeReasons.push("world_lore_read_failed");
    return null;
  }
}

function buildActiveNpcContext(args: {
  activeNpcId: string | null;
  deps: DialogueContextBuilderDeps;
  snapshot: RunSnapshotV2 | null;
  locationId: string | null;
  presentNpcIds: string[];
  revealTier: number;
  epistemicMemory: ReturnType<typeof coerceToEpistemicMemory>;
  forbiddenFactIds: string[];
  degradeReasons: string[];
}): DialogueContext["activeNpc"] {
  if (!args.activeNpcId) return null;
  try {
    const canon = getNpcCanonicalIdentity(args.activeNpcId);
    const relationPartial =
      args.snapshot?.player?.codex?.[args.activeNpcId] ??
      args.snapshot?.npcs?.[args.activeNpcId]?.relationshipState ??
      args.epistemicMemory?.npc_relationships?.[args.activeNpcId] ??
      {};
    const activeTaskIds = [
      ...(args.snapshot?.tasks?.active ?? []).map((task) => task.id),
      ...(args.snapshot?.tasks?.available ?? []).map((task) => task.id),
    ];
    const heart = args.deps.buildNpcHeartRuntimeView({
      npcId: args.activeNpcId,
      relationPartial,
      locationId: args.locationId ?? canon.canonicalHomeLocation,
      activeTaskIds,
      hotThreatPresent: false,
      maxRevealRank: args.revealTier,
      presentNpcIds: args.presentNpcIds,
    });
    const memoryKnown = args.epistemicMemory?.npc_epistemic_snapshots
      ?.find((row) => row.npcId === args.activeNpcId)
      ?.knownFactIds;

    return {
      npcId: args.activeNpcId,
      displayName: heart?.profile.displayName ?? canon.canonicalName,
      publicRole: canon.canonicalPublicRole || heart?.profile.surfaceMask,
      speechContract: heart?.profile.speechContract ?? canon.canonicalSpeechCore,
      coreDrive: heart?.profile.coreDrive,
      coreFear: heart?.profile.coreFear,
      tabooBoundary: heart?.profile.tabooBoundary,
      truthfulnessBand: heart?.profile.truthfulnessBand,
      attitudeLabel: heart?.attitudeLabel,
      relation: heart?.relation as Record<string, unknown> | undefined,
      knownFactIds: uniqueStrings(memoryKnown ?? []),
      forbiddenFactIds: args.forbiddenFactIds,
    };
  } catch {
    args.degradeReasons.push("npc_heart_build_failed");
    return null;
  }
}

async function loadRecentEvents(args: {
  deps: DialogueContextBuilderDeps;
  input: BuildDialogueContextInput;
  degradeReasons: string[];
}): Promise<DialogueContext["recentEvents"]> {
  try {
    return await args.deps.loadRecentStoryEvents({
      sessionId: args.input.sessionId,
      userId: args.input.userId,
      limit: 12,
    });
  } catch {
    args.degradeReasons.push("recent_story_events_read_failed");
    return [];
  }
}

async function loadNpcMemories(args: {
  deps: DialogueContextBuilderDeps;
  input: BuildDialogueContextInput;
  npcId: string | null;
  degradeReasons: string[];
}): Promise<DialogueContext["npcMemories"]> {
  if (!args.npcId) return [];
  try {
    return await args.deps.loadNpcMemories({
      npcId: args.npcId,
      sessionId: args.input.sessionId,
      userId: args.input.userId,
      limit: 8,
    });
  } catch {
    args.degradeReasons.push("npc_memory_entries_read_failed");
    return [];
  }
}

function collectAllowedEntityIds(args: {
  snapshot: RunSnapshotV2 | null;
  clientState: Record<string, unknown> | null;
  loreFacts: LoreFact[];
  activeNpcId: string | null;
  memorySpine: MemorySpineState | null;
}): string[] {
  const out = new Set<string>();
  const add = (value: unknown, predicate?: (id: string) => boolean) => {
    const id = typeof value === "string" ? value.trim() : "";
    if (!id) return;
    if (predicate && !predicate(id)) return;
    out.add(id);
  };

  if (args.activeNpcId && isRegistryOrSnapshotEntity(args.activeNpcId, args.snapshot)) add(args.activeNpcId);
  for (const id of Object.keys(args.snapshot?.npcs ?? {})) add(id);
  for (const id of Object.keys(args.snapshot?.player?.codex ?? {})) add(id);
  for (const id of idsFromItems(args.snapshot?.player?.inventory)) add(id);
  for (const id of idsFromItems(args.snapshot?.player?.warehouse)) add(id);
  for (const id of asStringArray(args.clientState?.inventoryItemIds)) add(id, isKnownItemId);
  for (const id of asStringArray(args.clientState?.warehouseItemIds)) add(id, isKnownItemId);
  for (const id of asStringArray(args.clientState?.presentNpcIds)) add(id, isKnownNpcId);
  for (const entry of args.memorySpine?.entries ?? []) {
    for (const id of entry.anchors?.npcIds ?? []) add(id, isKnownNpcId);
    for (const id of entry.anchors?.itemIds ?? []) add(id, isKnownItemId);
    for (const id of entry.anchors?.taskIds ?? []) add(id);
    for (const id of entry.anchors?.locationIds ?? []) add(id);
    for (const id of entry.anchors?.floorIds ?? []) add(id);
  }
  for (const fact of args.loreFacts) {
    add(fact.identity.factKey);
    add(fact.source.entityId);
    for (const tag of fact.tags ?? []) add(tag);
  }
  for (const id of contentPackEntityIds()) add(id);

  return [...out].slice(0, 160);
}

function collectForbiddenFactIds(args: {
  activeNpcId: string | null;
  epistemicMemory: ReturnType<typeof coerceToEpistemicMemory>;
  revealTier: number;
}): string[] {
  const fromReveal = (args.epistemicMemory?.reveal_tier_sensitive_facts ?? [])
    .filter((fact) => fact.minRevealRank > args.revealTier)
    .map((fact) => fact.id);
  const fromCanon: string[] = [];
  if (args.activeNpcId) {
    const canon = getNpcCanonicalIdentity(args.activeNpcId);
    if (!canon.canKnowLoopTruth) fromCanon.push(`canon:${args.activeNpcId}:loop_truth`);
    if (args.revealTier < canon.revealTierCap) fromCanon.push(`canon:${args.activeNpcId}:deep_role`);
  }
  if (args.epistemicMemory?.dm_only_truth_summary?.trim()) {
    fromCanon.push("memory:dm_only_truth_summary");
  }
  return uniqueStrings([...fromReveal, ...fromCanon]).slice(0, 80);
}

function collectPresentNpcIds(args: {
  snapshot: RunSnapshotV2 | null;
  clientState: Record<string, unknown> | null;
  locationId: string | null;
}): string[] {
  const fromClient = asStringArray(args.clientState?.presentNpcIds).filter(isKnownNpcId);
  const fromSnapshot = Object.entries(args.snapshot?.npcs ?? {})
    .filter(([, state]) => !args.locationId || state.currentLocation === args.locationId)
    .map(([npcId]) => npcId)
    .filter(isKnownNpcId);
  return uniqueStrings([...fromClient, ...fromSnapshot]).slice(0, 12);
}

function chooseActiveNpcId(args: {
  requestedNpcId?: string | null;
  presentNpcIds: string[];
  snapshot: RunSnapshotV2 | null;
}): string | null {
  const requested = normalizeNpcId(args.requestedNpcId);
  if (requested && isRegistryOrSnapshotEntity(requested, args.snapshot)) return requested;
  if (args.presentNpcIds.length === 1 && isRegistryOrSnapshotEntity(args.presentNpcIds[0], args.snapshot)) {
    return args.presentNpcIds[0];
  }
  return null;
}

function flattenLorePacketFacts(packet: LorePacket | null): LoreFact[] {
  if (!packet) return [];
  const byKey = new Map<string, LoreFact>();
  const groups = [
    packet.coreAnchors,
    packet.relevantEntities,
    packet.retrievedFacts,
    packet.privateFacts,
    packet.sceneFacts,
  ];
  for (const facts of groups) {
    for (const fact of facts ?? []) {
      if (!fact?.identity?.factKey) continue;
      byKey.set(fact.identity.factKey, fact);
    }
  }
  return [...byKey.values()].slice(0, 48);
}

function getRunSnapshot(input: BuildDialogueContextInput): RunSnapshotV2 | null {
  if (looksLikeRunSnapshot(input.runSnapshotV2)) return input.runSnapshotV2;
  const clientState = asRecord(input.clientState);
  const direct = clientState?.runSnapshotV2;
  if (looksLikeRunSnapshot(direct)) return direct;
  const slotId = stringOrNull(clientState?.currentSaveSlot);
  const saveSlots = asRecord(clientState?.saveSlots);
  const currentSlot = slotId ? asRecord(saveSlots?.[slotId]) : null;
  const slotSnapshot = currentSlot?.runSnapshotV2;
  return looksLikeRunSnapshot(slotSnapshot) ? slotSnapshot : null;
}

function looksLikeRunSnapshot(value: unknown): value is RunSnapshotV2 {
  const obj = asRecord(value);
  return Boolean(obj && obj.schemaVersion === 2 && asRecord(obj.player) && asRecord(obj.time));
}

function safeCoerceSessionMemory(
  row: SessionMemoryRow | null,
  degradeReasons: string[]
): ReturnType<typeof coerceToEpistemicMemory> {
  try {
    return coerceToEpistemicMemory(row);
  } catch {
    degradeReasons.push("session_memory_coerce_failed");
    return null;
  }
}

function resolveDialogueContextDeps(overrides?: Partial<DialogueContextBuilderDeps>): DialogueContextBuilderDeps {
  return {
    loadSessionMemoryForUser: loadSessionMemoryForUserDefault,
    loadWorldLore: loadWorldLoreDefault,
    loadRecentStoryEvents: loadRecentStoryEventsDefault,
    loadNpcMemories: loadNpcMemoriesDefault,
    buildNpcHeartRuntimeView,
    recordDegrade: recordDialogueContextDegradeDefault,
    ...overrides,
  };
}

async function loadSessionMemoryForUserDefault(userId: string): Promise<SessionMemoryRow | null> {
  const [{ db }, { gameSessionMemory }, { eq }] = await Promise.all([
    import("@/db"),
    import("@/db/schema"),
    import("drizzle-orm"),
  ]);
  const rows = await db
    .select({
      plotSummary: gameSessionMemory.plotSummary,
      playerStatus: gameSessionMemory.playerStatus,
      npcRelationships: gameSessionMemory.npcRelationships,
    })
    .from(gameSessionMemory)
    .where(eq(gameSessionMemory.userId, userId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    plot_summary: String(row.plotSummary ?? ""),
    player_status: asRecord(row.playerStatus) ?? {},
    npc_relationships: asRecord(row.npcRelationships) ?? {},
  };
}

async function loadWorldLoreDefault(request: RuntimeLoreRequest): Promise<LorePacket> {
  const { getRuntimeLore } = await import("@/lib/worldKnowledge/runtime/getRuntimeLore");
  return getRuntimeLore(request);
}

async function loadRecentStoryEventsDefault(input: StoryEventReadInput): Promise<RecentStoryEventRecord[]> {
  const result = await readRecentStoryEventsBestEffort(input);
  if (!result.ok) throw new Error(result.reason);
  return result.events;
}

async function loadNpcMemoriesDefault(input: NpcMemoryReadInput): Promise<NpcMemoryContextRecord[]> {
  const result = await readRecentNpcMemoriesBestEffort(input);
  if (!result.ok) throw new Error(result.reason);
  return result.memories;
}

async function recordDialogueContextDegradeDefault(input: {
  requestId: string;
  sessionId: string | null;
  userId: string | null;
  turnIndex: number;
  reasons: string[];
}): Promise<unknown> {
  return writeNarrativeRunBestEffort({
    requestId: input.requestId,
    sessionId: input.sessionId,
    userId: input.userId,
    turnIndex: input.turnIndex,
    meta: {
      dialogueContext: {
        degraded: true,
        reasons: input.reasons,
      },
    },
  });
}

async function recordDialogueContextDegrade(
  deps: DialogueContextBuilderDeps,
  args: {
    input: BuildDialogueContextInput;
    turnIndex: number;
    reasons: string[];
  }
): Promise<void> {
  try {
    await deps.recordDegrade({
      requestId: args.input.requestId,
      sessionId: args.input.sessionId,
      userId: args.input.userId,
      turnIndex: args.turnIndex,
      reasons: uniqueStrings(args.reasons),
    });
  } catch {
    // Context construction is on the player turn path; logging must stay optional.
  }
}

function contentPackEntityIds(): string[] {
  return uniqueStrings(
    CONTENT_PACKS.flatMap((pack) => [
      ...(pack.npcSpecs ?? []).map((npc) => npc.id),
      ...(pack.taskSpecs ?? []).flatMap((task) => [
        task.id,
        task.issuer.issuerId,
        ...(task.dramatic?.relatedNpcIds ?? []),
        ...(task.dramatic?.relatedLocationIds ?? []),
      ]),
      ...(pack.escapeSpecs?.conditions ?? []).map((condition) => condition.code),
      ...(pack.escapeSpecs?.fragments ?? []).flatMap((fragment) => [
        fragment.code,
        ...(fragment.anchors?.npcIds ?? []),
        ...(fragment.anchors?.locationIds ?? []),
      ]),
      ...(pack.escapeSpecs?.falseLeads ?? []).flatMap((lead) => [
        lead.code,
        ...(lead.anchors?.npcIds ?? []),
        ...(lead.anchors?.locationIds ?? []),
      ]),
    ])
  );
}

function isRegistryOrSnapshotEntity(id: string | null, snapshot: RunSnapshotV2 | null): id is string {
  if (!id) return false;
  if (isKnownNpcId(id) || isKnownItemId(id) || ANOMALIES.some((a) => a.id === id)) return true;
  return Boolean(snapshot?.npcs?.[id] || snapshot?.player?.codex?.[id]);
}

function isKnownNpcId(id: string): boolean {
  return isRegisteredCanonicalNpcId(id) || NPCS.some((npc) => npc.id === id);
}

function isKnownItemId(id: string): boolean {
  return ITEMS.some((item) => item.id === id) || WAREHOUSE_ITEMS.some((item) => item.id === id);
}

function normalizeNpcId(raw: unknown): string | null {
  const id = typeof raw === "string" ? raw.trim() : "";
  if (!id) return null;
  const match = id.match(/^(n)-(\d{3})$/i);
  return match ? `N-${match[2]}` : id;
}

function idsFromItems(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => asRecord(item)?.id)
    .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    .map((id) => id.trim());
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function stringOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeNumberRecord(value: unknown): Record<string, number> {
  const record = asRecord(value);
  if (!record) return {};
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(record)) {
    const num = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(num)) continue;
    out[key] = Math.trunc(num);
  }
  return out;
}

function normalizeInt(value: unknown, fallback: number): number {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? Math.trunc(num) : fallback;
}

function normalizeRevealTier(value: unknown): number {
  const tier = normalizeInt(value, 0);
  return Math.max(0, Math.min(12, tier));
}
