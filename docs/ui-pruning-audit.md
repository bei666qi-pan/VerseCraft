# UI pruning audit

> Scope: VerseCraft web UI, May 2026 development context. This audit is for removing user-visible interaction entry points only; underlying gameplay logic, state, content, schemas, save fields, analytics, and AI contracts remain protected.

## Project facts

- Framework: Next.js 16 App Router under `src/app`; no `pages/` router was found.
- Runtime UI: React 19, Tailwind CSS v4, Zustand 5.
- Persistence and backend: IndexedDB via `idb-keyval`/custom storage for client game state; PostgreSQL + Drizzle for server data and analytics.
- Package manager: `pnpm@10`; only `pnpm-lock.yaml` exists. No `yarn.lock`, `bun.lockb`, or `package-lock.json` exists.
- Local dev: `pnpm dev` starts Next on port `666`; production/Docker still use port `3000`.
- Tests and browser validation: Playwright is configured via `playwright.config.ts`; relevant scripts include `pnpm test:unit`, `pnpm test:e2e:chat`, `pnpm test:e2e:contract`, `pnpm test:ci`, and `npx eslint .`.

## Current routing and UI surface

- Main player surface: `src/app/play/page.tsx`.
- Unified in-game menu: `src/components/UnifiedMenuModal.tsx`.
- User-visible routes found under `src/app`: `/`, `/create`, `/history`, `/intro`, `/offline`, `/play`, `/preview`, `/settlement`, `/world/apartment`, `/legal/*`, `/saiduhsa/*`.
- No direct routes were found for taskbar, game guide, journal/inspiration notebook, warehouse, achievements, or weapons.
- Current `/play` render path imports `UnifiedMenuModal` only for the menu surface. `PlayTaskPanel`, `PlayGuideModal`, and `WeaponSlotPanel` are present as source files but are not imported by `src/app/play/page.tsx`.
- `UnifiedMenuModal` currently exposes only `settings` and `codex` in `MENU_TABS`. Legacy `activeMenu` values `backpack`, `warehouse`, and `achievements` are reset to `null` without rendering a menu panel.
- `e2e/play.spec.ts` already contains a protective Playwright check that `/play` has no `aria-label="任务栏"` or `aria-label="游戏指南"` button, and that the unified menu has no `backpack-tab`, `warehouse-tab`, or `achievements-tab`.

## Target feature inventory

| Target | UI entry files | Logic files to preserve | Data/content files to preserve | Current trigger path | Narrative-trigger migration path |
| --- | --- | --- | --- | --- | --- |
| 任务栏 | `src/features/play/components/PlayTaskPanel.tsx`; `src/features/play/components/PlayNarrativeTaskBoard.tsx`; old entry was controlled from `src/app/play/page.tsx`; current `/play` does not import/render it. | `src/store/useGameStore.ts` task state/actions; `src/lib/tasks/*`; `src/lib/play/taskBoardUi.ts`; `src/features/play/turnCommit/resolveDmTurn.ts`; `src/features/play/turnCommit/turnEnvelope.ts`. | `src/lib/tasks/taskV2.ts`; `src/lib/contentSpec/taskBuilders.ts`; `src/lib/contentSpec/taskTemplates.ts`; save/snapshot task fields in `src/store/useGameStore.ts` and `src/lib/state/snapshot/*`. | DM final JSON writes `new_tasks`, `task_updates`, and may emit `ui_hints.auto_open_panel="task"` / `highlight_task_ids`; current page only turns this into a short hint, not an opened panel. | Keep task deltas as structured state. Surface task progress through narrative/log lines, options, codex relationships, or a thin non-interactive notification adapter. Do not restore a task panel/button. |
| 游戏指南 | `src/features/play/components/PlayGuideModal.tsx`; `src/components/OnboardingGuide.tsx` exists but is not imported anywhere in `src`. | `src/lib/playRealtime/newPlayerGuidePackets.ts`; guide-related runtime packet assembly in `src/lib/playRealtime/runtimeContextPackets.ts`; guide analytics digest in `src/lib/analytics/playerContextDigest.ts`. | Guide text currently lives in the modal wrapper and runtime guide packet files; do not delete content text. | No current clickable guide button or route. Runtime guide information is injected through AI packets, not a UI modal. | Keep guidance as in-world NPC/narrative onboarding via `new_player_guide_packet` and scene text. If needed, add a thin narrative event adapter that emits short helper lines into the story log. |
| 灵感手记 | Previous menu/task panel surface depended on `PlayNarrativeTaskBoard` and journal board UI; no current visible tab/button was found. | `src/store/useGameStore.ts` `journalClues` and `mergeJournalClueUpdates`; `src/lib/domain/narrativeDomain.ts`; `src/lib/domain/clueMerge.ts`; `src/lib/domain/narrativeIntegrity.ts`; `src/lib/play/journalBoardUi.ts`. | Clue/journal state in save snapshots and `RunSnapshotV2`; clue content generated through DM `clue_updates` and repaired by narrative integrity helpers. | DM final JSON `clue_updates` is applied in `src/app/play/page.tsx`; no separate notebook panel is reachable. | Keep clue updates as structured state. Present important clue acquisition in narrative/log feedback and let future scenes reference clue state through packets/validators. |
| 仓库 | Previous unified menu `warehouse` tab; current `UnifiedMenuModal` does not include it and resets legacy `activeMenu="warehouse"` to `null`. | `src/store/useGameStore.ts` `warehouse` and `addWarehouseItems`; `src/app/play/page.tsx` awarded warehouse item application; `src/app/actions/save.ts` warehouse sanitization; `src/lib/play/itemGameplay.ts`; `src/lib/security/chatValidation.ts`. | `src/lib/registry/warehouseItems.ts`; warehouse fields in save/snapshot types; world knowledge bootstrap in `src/lib/worldKnowledge/bootstrap/registryAdapters.ts`. | DM final JSON `awarded_warehouse_items` is resolved from `WAREHOUSE_ITEMS` and written to store; the player may see a non-clickable acquisition log/hint, but no warehouse panel. | Keep warehouse as state and retrieval/content source. Trigger discoveries through narrative acquisition, service scenes, NPC trade, or world tick events. Do not add a warehouse tab/button. |
| 成就 | Previous unified menu `achievements` tab; current `UnifiedMenuModal` does not include it and resets legacy `activeMenu="achievements"` to `null`. | `src/store/useAchievementsStore.ts`; `src/components/HydrationProvider.tsx`; `src/app/settlement/page.tsx` record write; `src/lib/resilientStorage.ts` persisted key handling. | Achievement record shape and persisted storage key `versecraft-achievements`; settlement-derived achievement records. | Settlement writes achievement records in the background. No achievements panel or route is reachable. | Keep recording achievements as backend/client state. Future narrative-triggered reveal should be a non-panel log/toast or settlement text, not a navigable achievements surface. |
| 武器 | `src/components/WeaponSlotPanel.tsx`; current `/play` and `UnifiedMenuModal` do not import/render it. | `src/store/useGameStore.ts` `equippedWeapon`, `weaponBag`, `applyWeaponUpdates`, `applyWeaponBagUpdates`; `src/lib/playRealtime/equipmentExecution.ts`; `src/lib/playRealtime/weaponAdjudication.ts`; `src/lib/playRealtime/weaponInfusion.ts`; `src/lib/weapon/*`; `/api/chat` equipment guards. | `src/lib/registry/weapons.ts`; weapon fields in `src/lib/registry/types.ts`; save/snapshot weapon fields; weapon analytics in `src/lib/analytics/playerContextDigest.ts`. | Natural-language actions and DM final JSON `weapon_updates` / `weapon_bag_updates` still update weapon state; no weapon panel/button is reachable. | Keep weapons as a stateful narrative system. Equipment, maintenance, and weaponization should be triggered by story actions/service nodes and resolved through server guards, not by a weapon panel. |

## Entry points checked

- Top/header controls in `src/app/play/page.tsx`: settings button and input-mode toggle remain; no taskbar or guide buttons were found.
- Unified menu in `src/components/UnifiedMenuModal.tsx`: current tab list is only `settings` and `codex`; no backpack, warehouse, achievements, weapon, task, guide, or journal tab is rendered.
- Floating/modal wrappers: `PlayTaskPanel`, `PlayGuideModal`, and `WeaponSlotPanel` are unmounted from the main player route.
- Keyboard-focusable selectors: no `aria-label` or `data-onboarding` entry remains for target features in `src`; the only matches are the protective E2E assertions.
- Routes: no page route maps to these removed UI panels. Legacy UI routes are caught by `src/middleware.ts` through `src/lib/ui/prunedUiRoutes.ts` and redirected to `/play`.
- Debug-only surface: `NarrativeSystemsDebugPanel` can show counts for journal/task/warehouse under `NEXT_PUBLIC_VERSECRAFT_SYSTEMS_DEBUG=1`. It is a diagnostics surface, not a player feature entry, but it should stay debug-gated.

## Risk boundaries

Never delete or physically remove these without a separate schema/content migration plan:

- `src/store/useGameStore.ts`
- `src/store/useAchievementsStore.ts`
- `src/components/HydrationProvider.tsx`
- `src/app/actions/save.ts`
- `src/app/actions/onboarding.ts`
- `src/app/settlement/page.tsx`
- `src/app/play/page.tsx` state-application blocks for `awarded_items`, `awarded_warehouse_items`, `clue_updates`, `task_updates`, `weapon_updates`, and `weapon_bag_updates`
- `src/lib/registry/items.ts`
- `src/lib/registry/warehouseItems.ts`
- `src/lib/registry/weapons.ts`
- `src/lib/registry/types.ts`
- `src/lib/tasks/*`
- `src/lib/domain/*`
- `src/lib/playRealtime/*equipment*`, `src/lib/playRealtime/*weapon*`, and runtime packet files
- `src/lib/state/snapshot/*`
- `src/lib/analytics/*`
- `/api/chat` SSE/final JSON contract files under `src/app/api/chat/*` and `src/features/play/turnCommit/*`

## Implementation implication

The safe implementation path is to keep all state/data services intact and only prune render paths, menu tabs, focusable buttons, direct routes, and modal mounts. Legacy UI values can remain as compatibility state if they resolve to a visible allowed tab or close the modal; they must not render the removed panels.
