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
        className="absolute inset-0 bg-[#efe8dd]/78"
      />
      <div className="relative w-full max-w-3xl rounded-[26px] border border-[#d8cbb8] bg-[#fbf7f0]/98 text-[#164f4d] shadow-[0_22px_62px_rgba(77,61,40,0.18),inset_0_0_0_7px_rgba(248,244,237,0.92),inset_0_0_0_8px_rgba(209,199,184,0.55)]">
        <div className="flex items-center justify-between border-b border-[#d8cbb8] px-4 py-3 sm:px-6">
          <h3 className="vc-reading-serif text-[1.3rem] font-semibold text-[#0d5a4e]">游戏指南</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[12px] border border-[#d8cbb8] bg-[#fffdf8] px-3 py-1.5 text-xs font-semibold text-[#164f4d] transition hover:bg-[#f8f2e8]"
          >
            关闭
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto p-4 sm:p-6">
          <div className="space-y-6 text-sm leading-relaxed text-[#4f625c]">
            {PLAY_GUIDE_SECTIONS.map((section) => (
              <section
                key={section.id}
                className={section.framed ? "rounded-[18px] border border-[#d8cbb8] bg-[#fffdf8]/72 p-4 shadow-[inset_0_0_0_4px_rgba(248,244,237,0.6)]" : undefined}
              >
                <h4 className="vc-reading-serif text-[1.05rem] font-semibold text-[#0d5a4e]">{section.title}</h4>
                {section.body ? <p className="mt-2 text-[#4f625c]">{section.body}</p> : null}
                {section.bullets ? (
                  <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[#4f625c]">
                    {section.bullets.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                ) : null}
                {section.cards ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {section.cards.map((card) => (
                      <div key={card.title} className="rounded-[16px] border border-[#d8cbb8] bg-[#fffdf8] p-4">
                        <p className="text-xs font-semibold uppercase tracking-widest text-[#6f6a60]">{card.title}</p>
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

