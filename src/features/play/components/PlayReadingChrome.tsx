"use client";

import {
  BookOpen,
  Feather,
  Images,
  Settings,
  UserRound,
  Volume2,
  VolumeX,
  type LucideIcon,
} from "lucide-react";

export function PlayReadingHeader({
  audioMuted,
  onToggleAudio,
}: {
  audioMuted: boolean;
  onToggleAudio: () => void;
}) {
  return (
    <header className="shrink-0 border-b border-[#b98563]/15 bg-[#03101a]/95 px-4 pb-3 pt-[max(1.15rem,env(safe-area-inset-top))] text-[#f2c79d] shadow-[0_10px_24px_rgba(0,0,0,0.18)]">
      <div className="flex min-h-[62px] items-center justify-between gap-2.5">
        <div className="flex min-w-0 items-center gap-2.5 vc-reading-serif">
          <div className="flex shrink-0 items-center gap-1">
            <span className="whitespace-nowrap text-[25px] leading-none text-[#f1b586] drop-shadow-[0_0_10px_rgba(219,148,94,0.3)]">
              VerseCraft
            </span>
            <Feather className="mt-1 h-5 w-5 shrink-0 text-[#d89b6c]" strokeWidth={1.5} />
          </div>
          <span className="h-10 w-px shrink-0 bg-[#d4a076]/55" aria-hidden />
          <span className="shrink-0 whitespace-nowrap text-[18px] leading-none text-[#e5bd93]">
            第六章：雾港来信
          </span>
        </div>

        <button
          type="button"
          onClick={onToggleAudio}
          aria-label={audioMuted ? "开启声音" : "关闭声音"}
          className="flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-full border border-[#d99769]/80 bg-[#07131d]/70 text-[#efb17f] shadow-[0_0_18px_rgba(217,151,105,0.2),inset_0_0_14px_rgba(217,151,105,0.08)] transition hover:bg-[#0b1924] active:scale-95"
        >
          {audioMuted ? <VolumeX className="h-6 w-6" strokeWidth={1.9} /> : <Volume2 className="h-6 w-6" strokeWidth={1.9} />}
        </button>
      </div>
    </header>
  );
}

type DockItem = {
  label: string;
  icon: LucideIcon;
  active?: boolean;
  onClick: () => void;
};

function DockButton({ item }: { item: DockItem }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={item.onClick}
      className={`relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-none py-1 text-[#d6a07b] transition active:scale-95 ${
        item.active ? "text-[#ffd28d]" : "hover:text-[#f1bf90]"
      }`}
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

export function PlayBottomNavigation({
  onOpenCharacter,
  onFocusStory,
  onOpenCodex,
  onOpenSettings,
}: {
  onOpenCharacter: () => void;
  onFocusStory: () => void;
  onOpenCodex: () => void;
  onOpenSettings: () => void;
}) {
  const items: DockItem[] = [
    { label: "角色", icon: UserRound, onClick: onOpenCharacter },
    { label: "剧情", icon: BookOpen, active: true, onClick: onFocusStory },
    { label: "图鉴", icon: Images, onClick: onOpenCodex },
    { label: "设置", icon: Settings, onClick: onOpenSettings },
  ];

  return (
    <nav
      aria-label="阅读导航"
      className="shrink-0 rounded-t-[28px] border border-b-0 border-[#d39a70]/18 bg-[#03101a]/95 px-5 pb-[max(1.2rem,env(safe-area-inset-bottom))] pt-4 shadow-[0_-18px_34px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(233,177,132,0.1)]"
    >
      <div className="grid grid-cols-4 items-end gap-1">
        {items.map((item) => (
          <DockButton key={item.label} item={item} />
        ))}
      </div>
    </nav>
  );
}
