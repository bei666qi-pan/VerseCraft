"use client";

import { PLAY_GUIDE_SECTIONS } from "@/features/play/guideContent";

type PlayGuideModalProps = {
  open: boolean;
  onClose: () => void;
};

export function PlayGuideModal({ open, onClose }: PlayGuideModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        aria-label="关闭游戏指南"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/45 backdrop-blur-sm"
      />
      <div className="relative w-full max-w-3xl rounded-2xl border border-white/20 bg-slate-900/92 shadow-[0_30px_90px_rgba(2,6,23,0.8)] backdrop-blur-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 sm:px-6">
          <h3 className="text-sm font-semibold uppercase tracking-widest text-slate-200">游戏指南</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
          >
            关闭
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto p-4 sm:p-6">
          <div className="space-y-6 text-sm leading-relaxed text-slate-300">
            {PLAY_GUIDE_SECTIONS.map((section) => (
              <section
                key={section.id}
                className={section.framed ? "rounded-xl border border-white/10 bg-white/5 p-4" : undefined}
              >
                <h4 className="text-sm font-semibold tracking-widest text-slate-200">{section.title}</h4>
                {section.body ? <p className="mt-2 text-slate-300">{section.body}</p> : null}
                {section.bullets ? (
                  <ul className="mt-3 list-disc space-y-1.5 pl-5 text-slate-300">
                    {section.bullets.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                ) : null}
                {section.cards ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {section.cards.map((card) => (
                      <div key={card.title} className="rounded-xl border border-white/10 bg-white/5 p-4">
                        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{card.title}</p>
                        <ul className="mt-2 list-disc space-y-1.5 pl-5">
                          {card.bullets.map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

