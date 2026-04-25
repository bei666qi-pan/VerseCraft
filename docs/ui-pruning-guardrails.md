# UI pruning guardrails

## Intent

This pruning pass removes only user-facing interaction surfaces for:

- 任务栏
- 游戏指南
- 灵感手记
- 仓库
- 成就
- 武器

The product goal is not to delete those gameplay systems. They remain valid systems behind the narrative runtime.

## Hard rules

- Do not delete underlying logic, data models, registry content, prompt/runtime packets, store fields, save fields, reducers, services, hooks, analytics, or database/schema fields for these systems.
- Do not remove achievement records, weapon definitions, warehouse/item definitions, guide text, journal/clue content, task definitions, or save compatibility fields.
- Do not break old saves. Missing UI must not imply missing state.
- Do not remove `/api/chat` JSON fields or client application logic for `new_tasks`, `task_updates`, `clue_updates`, `awarded_items`, `awarded_warehouse_items`, `weapon_updates`, or `weapon_bag_updates`.
- Do not reintroduce these features as visible buttons, tabs, keyboard-focusable controls, routes, sidebars, docks, toolbars, floating panels, or modal entry points.
- Do not use CSS hiding as the only fix. Removed surfaces must not remain keyboard-focusable, route-reachable, or screen-reader reachable.
- Do not physically delete UI wrapper files unless a separate audit proves they contain no content or compatibility value. Prefer unmounting and removing entry paths.

## Allowed UI after pruning

- `settings` control surface for core settings, audio, exit, and non-target controls.
- `codex` surface, because 图鉴 is not part of the requested removal list.
- Non-clickable narrative/log feedback that mentions state changes, such as receiving an item or a clue.
- Debug-only diagnostics gated behind explicit debug environment flags, as long as they are not normal player entry points.

## Future trigger model

These systems should be triggered by story state and narrative events, not by panels:

- Tasks: DM `new_tasks` / `task_updates`, story log, options, NPC offers, and `resolveDmTurn` output.
- Guide: `new_player_guide_packet`, NPC onboarding lines, and contextual story hints.
- Journal/clues: DM `clue_updates`, narrative acquisition lines, and later scene references.
- Warehouse: `awarded_warehouse_items`, NPC trade/service scenes, world tick, and retrieval packets.
- Achievements: settlement or narrative milestone events that write records without opening an achievements panel.
- Weapons: natural-language equipment/maintenance/weaponization actions resolved by server guards and `weapon_updates` / `weapon_bag_updates`.

## Files protected by this guardrail

- `src/store/useGameStore.ts`
- `src/store/useAchievementsStore.ts`
- `src/components/HydrationProvider.tsx`
- `src/app/actions/save.ts`
- `src/app/actions/onboarding.ts`
- `src/app/play/page.tsx`
- `src/app/settlement/page.tsx`
- `src/app/api/chat/route.ts`
- `src/features/play/turnCommit/resolveDmTurn.ts`
- `src/features/play/turnCommit/turnEnvelope.ts`
- `src/lib/registry/items.ts`
- `src/lib/registry/warehouseItems.ts`
- `src/lib/registry/weapons.ts`
- `src/lib/registry/types.ts`
- `src/lib/tasks/*`
- `src/lib/domain/*`
- `src/lib/playRealtime/*`
- `src/lib/weapon/*`
- `src/lib/state/snapshot/*`
- `src/lib/analytics/*`

## Review checklist

Before merging UI pruning changes, verify:

- `/play` has no target feature button by text, `aria-label`, title, or `data-onboarding` marker.
- Unified menu tabs do not include backpack, warehouse, achievements, task, guide, journal, or weapon surfaces.
- Removed panels are not imported by the live player route.
- Hidden legacy `activeMenu` values do not render removed panels.
- No target feature has a direct route; legacy UI paths redirect to `/play` instead of opening panels.
- Existing state application and save/load compatibility for task, journal, warehouse, achievement, and weapon data still exist.
- `e2e/play.spec.ts` or equivalent Playwright coverage asserts the absence of target UI entries.
