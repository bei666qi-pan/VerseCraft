"use client";

import { MobileReadingIcons, type MobileReadingIcon } from "../icons";
import { mobileReadingTheme } from "../theme";
import type { MobileBottomNavProps } from "../types";
import { normalizeGameLanguage } from "@/lib/i18n/language";

type DockItem = {
  label: string;
  ariaLabel?: string;
  icon: MobileReadingIcon;
  testId: string;
  active?: boolean;
  disabled?: boolean;
  /** 存在未读的新发现（如图鉴新条目）时显示小圆点角标 */
  badge?: boolean;
  onClick?: () => void;
};

function DockButton({ item }: { item: DockItem }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={item.onClick}
      aria-label={item.badge ? `${item.ariaLabel ?? item.label}${item.label === "Codex" || item.label === "Quests" ? " (new)" : "（有新发现）"}` : item.ariaLabel ?? item.label}
      aria-current={item.active ? "page" : undefined}
      aria-disabled={item.disabled || undefined}
      data-testid={item.testId}
      className={`${mobileReadingTheme.bottomNavItem} ${
        item.active ? mobileReadingTheme.bottomNavItemActive : mobileReadingTheme.bottomNavItemInactive
      } ${item.disabled ? mobileReadingTheme.bottomNavItemDisabled : ""}`}
    >
      {item.active ? (
        <span className={mobileReadingTheme.bottomNavActiveIndicator} aria-hidden />
      ) : null}
      <span className="relative inline-block">
        <Icon
          className={`${mobileReadingTheme.bottomNavIcon} ${
            item.active ? mobileReadingTheme.bottomNavIconActive : ""
          }`}
          strokeWidth={0.66}
        />
        {item.badge ? (
          <span
            aria-hidden
            data-testid={`${item.testId}-badge`}
            className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full bg-vc-accent shadow-[0_0_6px_rgba(47,116,106,0.55)] ring-2 ring-vc-paper-bright"
          />
        ) : null}
      </span>
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
  onOpenTasks,
  hasUnreadCodex,
  hasUnviewedTaskUpdates,
  language,
}: MobileBottomNavProps) {
  const isEnglish = normalizeGameLanguage(language) === "en-US";
  const items: DockItem[] = [
    {
      label: isEnglish ? "Character" : "角色",
      ariaLabel: isEnglish ? "Open character" : "打开角色",
      icon: MobileReadingIcons.Character,
      testId: "bottom-nav-character",
      active: activeItem === "character",
      disabled: !onOpenCharacter,
      onClick: onOpenCharacter,
    },
    {
      label: isEnglish ? "Story" : "剧情",
      icon: MobileReadingIcons.Story,
      testId: "bottom-nav-story",
      active: activeItem === "story",
      onClick: onFocusStory,
    },
    {
      label: isEnglish ? "Quests" : "任务",
      ariaLabel: isEnglish ? "Open quests" : "打开任务",
      icon: MobileReadingIcons.Tasks,
      testId: "bottom-nav-tasks",
      active: activeItem === "tasks",
      disabled: !onOpenTasks,
      badge: Boolean(hasUnviewedTaskUpdates) && activeItem !== "tasks",
      onClick: onOpenTasks,
    },
    {
      label: isEnglish ? "Codex" : "图鉴",
      icon: MobileReadingIcons.Codex,
      testId: "bottom-nav-codex",
      active: activeItem === "codex",
      badge: Boolean(hasUnreadCodex) && activeItem !== "codex",
      onClick: onOpenCodex,
    },
    {
      label: isEnglish ? "Settings" : "设置",
      icon: MobileReadingIcons.Settings,
      testId: "bottom-nav-settings",
      active: activeItem === "settings",
      onClick: onOpenSettings,
    },
  ];

  return (
    <nav data-testid="mobile-bottom-nav" aria-label={isEnglish ? "Reading navigation" : "阅读导航"} className={mobileReadingTheme.bottomNav}>
      <div className={mobileReadingTheme.bottomNavGrid}>
        {items.map((item) => (
          <DockButton key={item.label} item={item} />
        ))}
      </div>
    </nav>
  );
}
