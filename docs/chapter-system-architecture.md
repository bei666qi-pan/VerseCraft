# Chapter System Architecture

## Product Definition

VerseCraft chapters are short playable objective loops, not fixed-length novel
sections. A chapter should deliver: clear objective, exploration or judgment,
meaningful choice, consequence, state sediment, and a hook into the next goal.

Default pacing:

- New-player chapters: 5-10 minutes.
- Standard chapters: 8-15 minutes.
- Climax chapters: 12-20 minutes.
- Completion is based on beats, minimum turns, key choices, and structured state
  changes, not raw word count.

## Core Files

- `src/lib/chapters/definitions.ts` defines chapter 1 and chapter 2.
- `src/lib/chapters/engine.ts` evaluates progress, completion, next-chapter
  unlock, safe review, and return-to-active behavior.
- `src/lib/chapters/progress.ts` turns committed turn signals into counters and
  beat completion.
- `src/lib/chapters/summary.ts` builds the end-of-chapter summary from
  structured turn signals.
- `src/lib/chapters/migration.ts` normalizes old saves into chapter 1 active.
- `src/features/play/chapters/*` renders mobile shell UI.

## Store And Persistence

`useGameStore.chapterState` is the client source of truth for:

- active chapter
- review chapter
- completed and unlocked chapters
- progress per chapter
- summaries per chapter
- pending chapter-end sheet

`SaveSlotData` and `RunSnapshotV2` now carry optional `chapterState`. Missing
state is normalized to chapter 1 active. This preserves old IndexedDB and cloud
payloads without deleting logs or gameplay state.

## Turn Integration

`/play` records chapter progress after a turn has finished streaming and after
structured state writes have completed. It does not modify `/api/chat`, does not
add required DM JSON fields, and does not treat narrative as the truth source.

Signals include:

- effective submitted turn count
- manual vs option source
- narrative character count for pacing only
- location change
- task add/update
- codex updates
- relationship updates
- clue updates
- item or warehouse awards
- sanity damage
- currency/risk/weapon changes

Chapter completion requires all required beats, minimum turns, key choices, and
at least one structured state change. Death, endgame, paywall, and streaming
states suppress chapter-end UI.

## Chapter Flow

Initial seeds:

- Chapter 1: `暗月初醒`
  - Objective: confirm situation, find first abnormal clue, understand actions
    have consequences.
  - Min/target/max turns: 3/4/6.
- Chapter 2: `门后回声`
  - Objective: follow the first clue and face a clearer obstacle or NPC trace.
  - Min/target/max turns: 4/5/7.

When chapter 1 completes, `ChapterEndSheet` displays the summary and unlocks
chapter 2. Clicking `进入下一章` activates chapter 2 without clearing logs.
In chapter 2, `ChapterNavigator` can open chapter 1 as a safe review. Returning
to current chapter restores chapter 2 without rolling back state.

## UI Boundary

The chapter UI lives inside the existing mobile reading shell and reuses the
dark blue-black and warm gold visual language. It adds no route, no external UI
framework, no external fonts, and no icon package. It does not expose taskbar,
guide, journal, warehouse, achievements, or weapon UI entries.

## Known Limits

Chapter summary is intentionally conservative. If structured deltas do not name
a concrete item, NPC, or clue, the summary uses generic state-sediment lines
instead of inventing facts.

## Verification

Primary checks for this feature:

- `src/lib/chapters/engine.test.ts` covers migration, initial state, progress
  accumulation, completion, unlock, review, return-to-active, and locked chapter
  guards.
- `e2e/chapter-flow.spec.ts` covers a real mobile `/play` flow with SSE-shaped
  `/api/chat` mock: finish chapter 1, show chapter end sheet, enter chapter 2,
  review chapter 1, return to chapter 2, and verify Codex/settings remain
  reachable.
- `e2e/play.spec.ts` keeps route and focus-path pruning assertions for removed
  UI entries.

Latest local verification is recorded in
`docs/chapter-system-browser-verification.md`.
