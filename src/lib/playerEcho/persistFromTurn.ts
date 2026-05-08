import type { RunSnapshotV2 } from "@/lib/state/snapshot/types";
import type { TurnCommitSummary } from "@/lib/turnEngine/commitTurn";
import type { VerseCraftRolloutFlagsSnapshot } from "@/lib/rollout/versecraftRolloutFlags";
import { extractPlayerEchoCandidatesFromTurn } from "./extract";
import { reducePlayerEchoCandidates } from "./reducer";
import {
  insertPlayerEchoEvents,
  readPlayerEchoCanon,
  upsertPlayerEchoCanon,
} from "./repository";
import type { EchoFragment, PlayerEchoCanon } from "./types";

export type PlayerEchoPersistRepository = {
  readPlayerEchoCanon(userId: string): Promise<PlayerEchoCanon | null>;
  upsertPlayerEchoCanon(userId: string, canon: PlayerEchoCanon): Promise<void>;
  insertPlayerEchoEvents(userId: string, runId: string | null | undefined, fragments: readonly EchoFragment[]): Promise<number>;
};

export type MaybePersistPlayerEchoFromResolvedTurnArgs = {
  flags?: Pick<
    VerseCraftRolloutFlagsSnapshot,
    "enablePlayerEchoCanon" | "enablePlayerEchoPersistence"
  > | null;
  userId?: string | null;
  runId?: string | null;
  dmRecord?: Record<string, unknown> | null;
  runSnapshotV2?: RunSnapshotV2 | null;
  turnCommitSummary?: TurnCommitSummary | null;
  latestUserInput?: string | null;
  nowIso?: string | null;
  repository?: PlayerEchoPersistRepository;
};

const defaultRepository: PlayerEchoPersistRepository = {
  readPlayerEchoCanon,
  upsertPlayerEchoCanon,
  insertPlayerEchoEvents,
};

function flagEnabled(
  flags: MaybePersistPlayerEchoFromResolvedTurnArgs["flags"]
): boolean {
  return Boolean(flags?.enablePlayerEchoCanon && flags.enablePlayerEchoPersistence);
}

function cleanUserId(userId: string | null | undefined): string | null {
  const id = typeof userId === "string" ? userId.trim() : "";
  return id ? id : null;
}

function compactLastRunSummary(fragments: readonly EchoFragment[]): string | null {
  const summaries = fragments.map((fragment) => fragment.summary).filter(Boolean).slice(0, 2);
  if (summaries.length === 0) return null;
  const out = summaries.join("；");
  return out.length <= 240 ? out : out.slice(0, 240);
}

function repeatedDeathCauses(fragments: readonly EchoFragment[]): string[] {
  return fragments
    .filter((fragment) => fragment.type === "death")
    .map((fragment) => fragment.summary)
    .filter(Boolean)
    .slice(0, 6);
}

function unresolvedRegrets(fragments: readonly EchoFragment[]): string[] {
  return fragments
    .filter((fragment) => fragment.type === "death" || fragment.type === "betrayal" || fragment.type === "hook")
    .map((fragment) => fragment.summary)
    .filter(Boolean)
    .slice(0, 8);
}

function strongestChoices(fragments: readonly EchoFragment[]): string[] {
  return fragments
    .filter((fragment) => fragment.type === "ending" || fragment.type === "rescue" || fragment.type === "npc_bond")
    .map((fragment) => fragment.summary)
    .filter(Boolean)
    .slice(0, 8);
}

function npcBondsFromFragments(fragments: readonly EchoFragment[]): NonNullable<PlayerEchoCanon["npcBonds"]> {
  return fragments
    .filter((fragment) => fragment.targetType === "npc" && fragment.targetId)
    .map((fragment) => ({
      npcId: fragment.targetId!,
      memoryPrivilege: "normal" as const,
      recognitionMode: "emotional_residue" as const,
      bondScore: Math.max(0.2, Math.min(1, fragment.emotionalWeight * 0.6 + fragment.salience * 0.4)),
      fragmentIds: [fragment.id],
    }))
    .slice(0, 8);
}

export async function maybePersistPlayerEchoFromResolvedTurn(
  args: MaybePersistPlayerEchoFromResolvedTurnArgs
): Promise<void> {
  try {
    if (!flagEnabled(args.flags)) return;
    const userId = cleanUserId(args.userId);
    if (!userId) return;

    const candidates = extractPlayerEchoCandidatesFromTurn({
      userId,
      runId: args.runId,
      dmRecord: args.dmRecord,
      runSnapshotV2: args.runSnapshotV2,
      turnCommitSummary: args.turnCommitSummary,
      latestUserInput: args.latestUserInput,
      nowIso: args.nowIso,
    });
    if (candidates.length === 0) return;

    const repo = args.repository ?? defaultRepository;
    const prev = await repo.readPlayerEchoCanon(userId);
    const next = reducePlayerEchoCandidates(prev, {
      schema: "player_echo_canon_v1",
      version: 1,
      playerKey: userId,
      worldId: "dark_moon_prologue",
      loopCount: Math.max(1, (prev?.loopCount ?? 0) + 1),
      fragments: candidates,
      npcBonds: npcBondsFromFragments(candidates),
      strongestChoices: strongestChoices(candidates),
      unresolvedRegrets: unresolvedRegrets(candidates),
      repeatedDeathCauses: repeatedDeathCauses(candidates),
      stableEchoSummary: prev?.stableEchoSummary ?? null,
      lastRunSummary: compactLastRunSummary(candidates),
      updatedAt: args.nowIso ?? new Date().toISOString(),
    });
    await repo.upsertPlayerEchoCanon(userId, next);
    await repo.insertPlayerEchoEvents(userId, args.runId, candidates);
  } catch {
    // Echo persistence is strictly best-effort and must never affect the live turn.
  }
}

export function schedulePlayerEchoPersistFromTurn(
  args: MaybePersistPlayerEchoFromResolvedTurnArgs
): void {
  void Promise.resolve()
    .then(() => maybePersistPlayerEchoFromResolvedTurn(args))
    .catch(() => {
      // maybePersist already swallows, this is a final guard against detached rejections.
    });
}
