"use client";

import { MobileReadingIcons, type MobileReadingIcon } from "../icons";
import { mobileReadingTheme } from "../theme";
import type { MobileBottomNavProps } from "../types";

type DockItem = {
  label: string;
  icon: MobileReadingIcon;
  testId: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
};

function DockButton({ item }: { item: DockItem }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={item.onClick}
      aria-disabled={item.disabled || undefined}
      data-testid={item.testId}
      className={`relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-none py-1 text-[#d6a07b] transition active:scale-95 ${
        item.active ? "text-[#ffd28d]" : "hover:text-[#f1bf90]"
      } ${item.disabled ? "cursor-default" : ""}`}
    >
      {item.active ? (
        <span
          className="pointer-events-none absolute -bottom-6 h-20 w-24 rounded-full bg-[#d8863d]/25 blur-2xl"
          aria-hidden
        />
      ) : null}
      <Icon
        className={`relative z-10 h-8 w-8 ${item.active ? "drop-shadow-[0_0_14px_rgba(255,200,128,0.85)]" : ""}`}
        strokeWidth={1.65}
      />
      <span className="relative z-10 vc-reading-serif text-[18px] leading-none">{item.label}</span>
    </button>
  );
}

export function MobileBottomNav({
  onOpenCharacter,
  onFocusStory,
  onOpenCodex,
  onOpenSettings,
}: MobileBottomNavProps) {
  const items: DockItem[] = [
    {
      label: "角色",
      icon: MobileReadingIcons.Character,
      testId: "bottom-nav-character",
      disabled: !onOpenCharacter,
      onClick: onOpenCharacter,
    },
    {
      label: "剧情",
      icon: MobileReadingIcons.Story,
      testId: "bottom-nav-story",
      active: true,
      onClick: onFocusStory,
    },
    {
      label: "图鉴",
      icon: MobileReadingIcons.Codex,
      testId: "bottom-nav-codex",
      onClick: onOpenCodex,
    },
    {
      label: "设置",
      icon: MobileReadingIcons.Settings,
      testId: "bottom-nav-settings",
      onClick: onOpenSettings,
    },
  ];

  return (
    <nav data-testid="mobile-bottom-nav" aria-label="阅读导航" className={mobileReadingTheme.bottomNav}>
      <div className="grid grid-cols-4 items-end gap-1">
        {items.map((item) => (
          <DockButton key={item.label} item={item} />
        ))}
      </div>
    </nav>
  );
}
