# Tasks: consolidate-player-facing-writer

## Implementation

- [x] **T1: Create `generateWriterTurn` facade in `logicalTasks.ts`**
  - Delegates to `generateMainReply`
  - JSDoc documents Writer responsibility boundaries
- [x] **T2: Add `AI_MODEL_WRITER` resolution in `envCore.ts`**
  - Falls back to `AI_MODEL_MAIN` when not configured
  - `AI_MODEL_MAIN` preserved for backward compat
- [x] **T3: Register `WRITER` role in `taskPolicy.ts`**
  - Already exists as `const WRITER = "writer" as const`
  - PLAYER_CHAT primaryRole = main (canonical writer in code path)
- [x] **T4: Verify backward compat**
  - Old configs without `AI_MODEL_WRITER` still work
  - Old `main` role chain still resolves
  - analytics not broken
- [x] **T5: Writer prompt constraints**
  - `generateWriterTurn` JSDoc states: narrative ≠ state truth source
  - Writer does not decide domain outcomes

## Verification

- [x] Unit tests pass: 3573/3574 (1 pre-existing fail)
- [x] ESLint clean on relevant files
- [x] AI routing tests pass (`execute.playerStream.fallback.test.ts`)
