import type { NpcFirstEncounterEchoPlan, SelectedEchoFragment } from "@/lib/playerEcho/types";

export type NarrativeTurnMessage = {
  role: string;
  content: string;
};

export type NarrativeTurnInput = {
  requestId: string;
  sessionId: string | null;
  userId: string | null;
  latestUserInput: string;
  messages: NarrativeTurnMessage[];
  playerContext: string;
  clientState: unknown;
  clientPurpose?: string | null;
  signal?: AbortSignal;
};

export type NarrativeRunSummary = {
  requestId: string;
  sessionId: string | null;
  userId: string | null;
  messageCount: number;
  latestUserInputChars: number;
  playerContextChars: number;
  clientPurpose: string | null;
  phase: "transitional_shell";
  handledBy: "api_chat_route";
};

export type NarrativeTurnResult = {
  sseStream?: ReadableStream<Uint8Array>;
  finalPayload?: string;
  status: number;
  commitSummary?: unknown;
  narrativeRunSummary?: unknown;
};

export type NarrativeTurnContext = {
  requestId: string;
  sessionId: string | null;
  userId: string | null;
  latestUserInput: string;
  messageCount: number;
  playerContextChars: number;
  clientPurpose: string | null;
  hasClientState: boolean;
};

export type DialogueContext = {
  requestId: string;
  sessionId: string | null;
  userId: string | null;

  player: {
    locationId: string | null;
    time: { day: number; hour: number } | null;
    stats: Record<string, number>;
    inventoryIds: string[];
    currentProfession?: string | null;
    knownFactIds: string[];
    discoveredClueIds: string[];
  };

  chapter: {
    chapterId: string | null;
    title: string | null;
    status: string | null;
    sceneId: string | null;
    phase: string | null;
    promise: string | null;
    mainQuestion: string | null;
    emotionalTone: string | null;
    mustEchoSummaries: string[];
    unresolvedThreads: string[];
    forbiddenRevealIds: string[];
    closePolicy: string | null;
    writerInstruction: string | null;
    /** Legacy alias for callers that still read the old chapter objective. */
    objective: string | null;
    completedBeatIds: string[];
    allowedEventIds: string[];
    blockedEventIds: string[];
  };

  activeNpc: {
    npcId: string;
    displayName: string;
    publicRole?: string;
    speechContract?: string;
    coreDrive?: string;
    coreFear?: string;
    tabooBoundary?: string;
    truthfulnessBand?: string;
    attitudeLabel?: string;
    relation?: Record<string, unknown>;
    knownFactIds?: string[];
    forbiddenFactIds?: string[];
  } | null;

  npcMemories: Array<{
    id: string | number;
    npcId: string;
    scope: string;
    kind: string;
    summary: string;
    salience: number;
    confidence: number;
    emotion?: Record<string, unknown>;
  }>;

  world: {
    worldId: string;
    loreFacts: Array<{
      factKey: string;
      canonicalText: string;
      layer?: string;
      tags?: string[];
    }>;
    hardRules: string[];
    allowedEntityIds: string[];
    forbiddenFactIds: string[];
    revealTier: number;
  };

  recentEvents: Array<{
    id: string | number;
    turnIndex: number;
    actorType: string;
    actorId?: string | null;
    eventType: string;
    summary: string;
  }>;

  playerEcho?: {
    selectedFragments: SelectedEchoFragment[];
    firstEncounterPlan: NpcFirstEncounterEchoPlan | null;
    packetDigest: string | null;
    packetCharLen: number;
  };

  rawCompatibility: {
    playerContext: string;
    clientState: unknown;
    sessionMemory?: unknown;
    runSnapshotV2?: unknown;
  };
};
