import type { ScopedFact } from "./classifyFactScope";

export type ConflictAction = "allow_private" | "enqueue_review" | "reject_shared_direct";
export type ConflictStatus = "none" | "conflicted_core" | "conflicted_shared" | "superseded_private";

export interface ConflictDecision {
  fact: ScopedFact;
  action: ConflictAction;
  status: ConflictStatus;
  reasons: string[];
}

export interface ConflictProbe {
  hasCoreConflict(normalized: string): Promise<boolean>;
  hasSharedConflict(normalized: string): Promise<boolean>;
  hasPrivateConflict(args: { userId: string | null; normalized: string }): Promise<boolean>;
}

export function createNoopConflictProbe(): ConflictProbe {
  return {
    async hasCoreConflict() {
      return false;
    },
    async hasSharedConflict() {
      return false;
    },
    async hasPrivateConflict() {
      return false;
    },
  };
}

export async function detectConflicts(args: {
  facts: ScopedFact[];
  probe?: ConflictProbe;
}): Promise<ConflictDecision[]> {
  const probe = args.probe ?? createNoopConflictProbe();
  const out: ConflictDecision[] = [];

  for (const fact of args.facts) {
    const reasons: string[] = [];
    if (fact.scope === "core_protected") {
      out.push({
        fact,
        action: "reject_shared_direct",
        status: "conflicted_core",
        reasons: ["core_protected_scope"],
      });
      continue;
    }

    const coreConflict = await probe.hasCoreConflict(fact.normalized);
    if (coreConflict) {
      reasons.push("conflict_with_core_canon");
      out.push({
        fact,
        action: fact.scope === "user_private" || fact.scope === "session_fact" ? "allow_private" : "reject_shared_direct",
        status: "conflicted_core",
        reasons,
      });
      continue;
    }

    if (fact.scope === "shared_candidate") {
      const sharedConflict = await probe.hasSharedConflict(fact.normalized);
      if (sharedConflict) {
        out.push({
          fact,
          action: "enqueue_review",
          status: "conflicted_shared",
          reasons: ["conflict_with_verified_shared"],
        });
        continue;
      }
      out.push({ fact, action: "enqueue_review", status: "none", reasons: ["shared_candidate_requires_review"] });
      continue;
    }

    if (fact.scope === "user_private" || fact.scope === "session_fact") {
      const privateConflict = await probe.hasPrivateConflict({
        userId: fact.userId,
        normalized: fact.normalized,
      });
      out.push({
        fact,
        action: "allow_private",
        status: privateConflict ? "superseded_private" : "none",
        reasons: privateConflict ? ["private_fact_version_upgrade"] : ["private_fact_allowed"],
      });
      continue;
    }

    out.push({ fact, action: "allow_private", status: "none", reasons: ["default_allow"] });
  }

  return out;
}
