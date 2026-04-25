"use client";

import { MobileReadingIcons, type MobileReadingIcon } from "../icons";
import { mobileReadingTheme } from "../theme";
import type { MobileBottomNavProps } from "../types";

type DockItem = {
  label: string;
  ariaLabel?: string;
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
      aria-label={item.ariaLabel ?? item.label}
      aria-current={item.active ? "page" : undefined}
      aria-disabled={item.disabled || undefined}
      data-testid={item.testId}
      className={`${mobileReadingTheme.bottomNavItem} ${
        item.active ? mobileReadingTheme.bottomNavItemActive : mobileReadingTheme.bottomNavItemInactive
      } ${item.disabled ? mobileReadingTheme.bottomNavItemDisabled : ""}`}
    >
      {item.active ? (
        <span className={mobileReadingTheme.bottomNavActiveGlow} aria-hidden />
      ) : null}
      <Icon
        className={`${mobileReadingTheme.bottomNavIcon} ${
          item.active ? mobileReadingTheme.bottomNavIconActive : ""
        }`}
        strokeWidth={1.65}
      />
      <span className={mobileReadingTheme.bottomNavLabel}>{item.label}</span>
    </button>
  );
}

export function MobileBottomNav({
  activeItem,
  onOpenCharacter,
  onFocusStory,
  onOpenCodex,
  onOpenSettings,
}: MobileBottomNavProps) {
  const items: DockItem[] = [
    {
      label: "角色",
      ariaLabel: "打开角色",
      icon: MobileReadingIcons.Character,
      testId: "bottom-nav-character",
      active: activeItem === "character",
      disabled: !onOpenCharacter,
      onClick: onOpenCharacter,
    },
    {
      label: "剧情",
      icon: MobileReadingIcons.Story,
      testId: "bottom-nav-story",
      active: activeItem === "story",
      onClick: onFocusStory,
    },
    {
      label: "图鉴",
      icon: MobileReadingIcons.Codex,
      testId: "bottom-nav-codex",
      active: activeItem === "codex",
      onClick: onOpenCodex,
    },
    {
      label: "设置",
      icon: MobileReadingIcons.Settings,
      testId: "bottom-nav-settings",
      active: activeItem === "settings",
      onClick: onOpenSettings,
    },
  ];

  return (
    <nav data-testid="mobile-bottom-nav" aria-label="阅读导航" className={mobileReadingTheme.bottomNav}>
      <div className={mobileReadingTheme.bottomNavGrid}>
        {items.map((item) => (
          <DockButton key={item.label} item={item} />
        ))}
      </div>
    </nav>
  );
}
