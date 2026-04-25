# Mobile Reading UI

This folder owns the mobile-first reading shell for `/play`.

It intentionally does not own the `/api/chat` stream, turn commit, option regeneration,
Zustand persistence, or game-state mutation rules. `src/app/play/page.tsx` remains the
orchestrator for those business flows and passes only the required props into this UI layer.

## Boundaries

- `MobileReadingShell` provides the `100dvh` reading surface and root `data-testid`.
- `MobileReadingHeader` owns the brand/chapter/audio row.
- `MobileStoryViewport` wraps the scrollable story area that still renders through
  `PlayStoryScroll`.
- `MobileActionDock` owns the bottom input pill and uses `useMobileActionDock` for local UI
  state such as submit flash, helper text, and talent button labels.
- `MobileOptionsDropdown` owns the visual list of four model-delivered options.
- `MobileBottomNav` owns the visual dock. Character is intentionally non-routing for now;
  codex and settings continue through `UnifiedMenuModal`.
- `theme.ts` and `icons.tsx` keep visual tokens and icon choices in one place.

## Theme Tokens

Edit `theme.ts` first when changing screenshot-level visual language. It exports:

- `mobileReadingTokens` for the stable values: near-black background, warm-gold palette,
  translucent border levels, story text colors, glow shadows, mobile spacing, dock heights,
  input height, and safe-area padding.
- `mobileReadingTheme` for the Tailwind class strings consumed by the shell components.

Keep new color, glow, border, height, and safe-area values in this file. Small one-off layout
classes are acceptable inside components, but do not scatter a second visual system across the
reading shell.

## Icons

Edit `icons.tsx` for the custom mobile reading icon system. The icons are inline SVG React
components, use `currentColor`, share rounded stroke caps/joins, and are designed to remain clear
at 24, 28, 32, and 40 px. Do not swap this layer back to lucide or external image assets.

The main exports are:

- `MobileReadingIcons` for header, action dock, option, send, and bottom nav icons.
- `MobileReadingTalentIcons` for the six echo talents.
- `MobileReadingTalentIcon` for rendering the correct echo talent glyph from a stored label.
- `getMobileReadingTalentIcon()` for mapping a stored talent label to its icon with a safe default.
- `MobileReadingIconProps` / `MobileReadingIcon` / `MobileReadingTalentIconProps` for adding future
  icons consistently.

Buttons should provide `aria-label`; icon components also accept a `title` prop for standalone
accessible SVG use.

Do not add SSE parsing, final-frame handling, store persistence, task/codex/warehouse mutation,
or option regeneration business logic here. Keep those in the existing play orchestration and
turn-commit modules.
