# Stage 3 Final Acceptance (Branch Saves + Profession V1)

## Scope

Stage 3 keeps a light, system-first expansion:

- Branch Saves V1: preserve key life forks for high-risk attempts.
- Profession / Transfer V1: route certification on top of existing five attributes.
- No heavy RPG tree, no branch merge, no cross-branch resource inheritance.

## Architecture Summary

### Branch Saves V1

- Slot metadata is explicit: `slotId/kind/label/parentSlotId/branchFromDecisionId/snapshotSummary`.
- Snapshot is the source of truth (`runSnapshotV2`) and projected to legacy for compatibility.
- Branch creation is guarded by safe-point rules (`canCreateManualBranch`).
- Save writes both active slot and paired auto slot.

### Profession / Transfer V1

- Three-stage gate is mandatory:
  1. Attribute qualified
  2. Behavior evidence qualified
  3. Certification trial task completed
- Certification writes durable state (`professionState`) and world recognition traces.
- Profession benefits are lightweight and system-coupled (threat/weapon/forge/task/codex/relationship).

## Branch Save Rules

- Branch creation only at safe zones or unlocked anchors.
- Active high-pressure threat phase blocks manual branch creation.
- Branches are isolated snapshots; loading another branch restores its own full state.
- Deleting one branch does not mutate other branches.

## Profession / Transfer Rules

- Attribute does not auto-transfer profession.
- Certification requires explicit task completion and state write-back.
- Current profession is reflected in store, packets, and UI.
- Profession active is a small tactical trigger with cooldown, not a burst-damage skill.

## Branch x Profession Boundaries

- Profession state persists per branch snapshot.
- Certification and profession gains do not leak to other branches.
- Branch switching restores that branch's profession, tasks, threats, weapon, revive context, and relationship/codex state.

## Stage 3 Explicitly Not Included

- Large skill trees
- Dual profession / mixed class
- Branch merge timeline
- Cross-branch economy/resource inheritance
- Heavy profession-exclusive story trees
- New macro economy loop
- Heavy profession-specific UI pages

## Acceptance Checklist

- Branch metadata and snapshot summaries are stable.
- Branch clone/load keeps state consistency.
- Cross-branch isolation is preserved.
- Profession migration/persistence is stable.
- Profession eligibility/progress/certification is test-covered.
- Certification task integration is test-covered.
- Profession packets are dynamic and structured.
- UI keeps minimal profession/branch surfaces only.

