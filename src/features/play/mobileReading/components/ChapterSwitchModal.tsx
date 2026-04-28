"use client";

import type { ChapterId, ChapterState } from "@/lib/chapters";
import { buildSettingsChapterItems } from "../settingsChapters";

function OrnamentLine({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 text-[#9fb0aa] ${className}`} aria-hidden>
      <span className="h-px flex-1 bg-[#d8d1c6]" />
      <span className="text-[14px] leading-none">◇</span>
      <span className="h-px flex-1 bg-[#d8d1c6]" />
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#ede7de]/55 px-7 py-[max(2rem,env(safe-area-inset-top))] backdrop-blur-[3px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="chapter-switch-title"
    >
      <section className="relative w-full max-w-[360px] rounded-[24px] border border-[#d8d1c6] bg-[#fffdf8]/96 px-6 pb-8 pt-8 text-[#174d46] shadow-[0_18px_44px_rgba(73,63,51,0.16),inset_0_1px_0_rgba(255,255,255,0.92)]">
        <div className="pointer-events-none absolute inset-2 rounded-[21px] border border-[#ebe5dc]" aria-hidden />
        <button
          type="button"
          onClick={onClose}
          className="absolute right-6 top-7 z-10 rounded-full border border-[#d8d1c6] bg-[#fffdf8] px-4 py-2 vc-reading-serif text-[16px] leading-none text-[#174d46] shadow-[0_6px_14px_rgba(73,63,51,0.1)] transition hover:bg-white active:scale-95"
        >
          关闭
        </button>
        <header className="text-center">
          <h2 id="chapter-switch-title" className="pointer-events-none vc-reading-serif text-[32px] font-semibold leading-none text-[#174d46]">
            切换章节
          </h2>
          <p className="mt-3 vc-reading-serif text-[16px] leading-none text-[#4f706a]">
            上滑查看已解锁章节
          </p>
        </header>
        <OrnamentLine className="mt-6" />
        <div data-testid="chapter-switch-list" className="relative mt-5 max-h-[54vh] overflow-y-auto pr-1 [scrollbar-color:#8fa79f_transparent] [scrollbar-width:thin]">
          <div className="divide-y divide-[#ded8ce]">
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
                      ? "my-2 rounded-[14px] border border-[#d8d1c6] bg-[#f4f6f2] px-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]"
                      : item.selectable
                        ? "px-4 text-[#174d46] hover:bg-[#f6f2ec] active:scale-[0.99]"
                        : "px-4 text-[#8b8a84] opacity-70"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block vc-reading-serif text-[22px] font-semibold leading-tight">
                      {item.title}
                    </span>
                    <span className="mt-1 block vc-reading-serif text-[15px] leading-none text-[#6c7f79]">
                      {item.statusLabel}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 vc-reading-serif text-[20px] ${
                      current
                        ? "rounded-full border border-[#cfc8bc] bg-[#fffdf8] px-4 py-1 text-[17px]"
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
