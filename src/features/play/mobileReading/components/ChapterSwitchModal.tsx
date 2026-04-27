"use client";

import type { ChapterId, ChapterState } from "@/lib/chapters";
import { buildSettingsChapterItems } from "../settingsChapters";

function OrnamentLine({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 text-[#c97843] ${className}`} aria-hidden>
      <span className="h-px flex-1 bg-[#9f5d35]/80" />
      <span className="text-[14px] leading-none">◇</span>
      <span className="h-px flex-1 bg-[#9f5d35]/80" />
    </div>
  );
}

export function ChapterSwitchModal({
  chapterState,
  open,
  onClose,
  onSelectChapter,
}: {
  chapterState: ChapterState;
  open: boolean;
  onClose: () => void;
  onSelectChapter: (chapterId: ChapterId) => void;
}) {
  if (!open) return null;
  const items = buildSettingsChapterItems(chapterState);
  return (
    <div
      data-testid="chapter-switch-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/58 px-7 py-[max(2rem,env(safe-area-inset-top))] backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="chapter-switch-title"
    >
      <section className="relative w-full max-w-[360px] rounded-[16px] border border-[#ad6539]/85 bg-[#07131b]/97 px-7 pb-8 pt-8 text-[#dba35f] shadow-[0_18px_55px_rgba(0,0,0,0.5),inset_0_0_28px_rgba(221,151,92,0.05)]">
        <div className="pointer-events-none absolute -right-3 -top-2 h-[88px] w-[88px] rounded-[18px] border border-[#9f5d35]/70" aria-hidden />
        <button
          type="button"
          onClick={onClose}
          className="absolute right-7 top-7 z-10 rounded-[9px] border border-[#c97843]/75 bg-[#07131b]/85 px-4 py-2 vc-reading-serif text-[16px] leading-none text-[#e4ad6d] transition hover:bg-[#10202a] active:scale-95"
        >
          关闭
        </button>
        <header className="text-center">
          <h2 id="chapter-switch-title" className="pointer-events-none vc-reading-serif text-[32px] font-semibold leading-none text-[#d99a55]">
            切换章节
          </h2>
          <p className="mt-2 vc-reading-serif text-[16px] leading-none text-[#b9865b]">
            上滑查看已解锁章节
          </p>
        </header>
        <OrnamentLine className="mt-6" />
        <div data-testid="chapter-switch-list" className="mt-5 max-h-[54vh] overflow-y-auto pr-1 [scrollbar-color:#b87645_transparent] [scrollbar-width:thin]">
          <div className="divide-y divide-[#9e5c35]/75">
            {items.map((item) => {
              const current = item.status === "current";
              return (
                <button
                  key={item.id}
                  type="button"
                  data-testid="chapter-switch-item"
                  data-chapter-id={item.id}
                  disabled={!item.selectable}
                  aria-current={current ? "page" : undefined}
                  onClick={() => onSelectChapter(item.id)}
                  className={`flex min-h-[78px] w-full items-center justify-between gap-4 py-4 text-left transition ${
                    current
                      ? "my-2 rounded-[10px] border border-[#a66a3d]/80 bg-[#3a281b]/78 px-4 shadow-[inset_0_0_18px_rgba(222,151,88,0.06)]"
                      : item.selectable
                        ? "px-4 text-[#dca762] hover:bg-[#11202a]/70 active:scale-[0.99]"
                        : "px-4 text-[#80624b] opacity-70"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block vc-reading-serif text-[22px] font-semibold leading-tight">
                      {item.title}
                    </span>
                    <span className="mt-1 block vc-reading-serif text-[15px] leading-none text-[#b98b65]">
                      {item.statusLabel}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 vc-reading-serif text-[20px] ${
                      current
                        ? "rounded-full border border-[#e0b070]/85 px-4 py-1 text-[17px]"
                        : ""
                    }`}
                  >
                    {item.actionLabel}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <OrnamentLine className="mx-auto mt-7 w-[48%]" />
      </section>
    </div>
  );
}
