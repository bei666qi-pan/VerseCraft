"use client";

import type { EchoTalent } from "@/store/useGameStore";
import { useGameStore } from "@/store/useGameStore";
import { TALENTS } from "./constants";

export function CreateTalentGrid({
  selectedTalent,
  onSelectTalent,
}: {
  selectedTalent: EchoTalent | null;
  onSelectTalent: (talent: EchoTalent) => void;
}) {
  const language = useGameStore((state) => state.language);
  const englishCopy: Partial<Record<EchoTalent, { title: string; cd: string; desc: string }>> = {
    时间回溯: { title: "Time Rewind", cd: "Cooldown: 6 hours", desc: "Return to where you stood one hour ago." },
    命运馈赠: { title: "Gift of Fate", cd: "Cooldown: 10 hours", desc: "Receive one gifted item." },
    主角光环: { title: "Hero's Halo", cd: "Cooldown: 8 hours", desc: "Briefly become the true protagonist." },
    生命汇源: { title: "Life Spring", cd: "Cooldown: 10 hours", desc: "Restore up to 20 Sanity." },
    洞察之眼: { title: "Eye of Insight", cd: "Cooldown: 8 hours", desc: "Reveal the most reliable next direction." },
    丧钟回响: { title: "Deathbell Echo", cd: "Cooldown: 30 hours", desc: "Clear one malicious entity." },
  };
  return (
    <div data-testid="create-talent-grid" className="mt-4 grid grid-cols-2 gap-3">
      {TALENTS.map((talent) => {
        const active = selectedTalent === talent.key;
        return (
          <button
            key={talent.key}
            type="button"
            data-testid={`create-talent-${talent.key}`}
            aria-pressed={active}
            onClick={() => onSelectTalent(talent.key)}
            className={`relative min-h-[76px] rounded-2xl border px-4 py-3.5 text-left transition active:scale-[0.98] ${
              active
                ? "border-vc-ink-deep bg-vc-ink-deep shadow-[0_12px_26px_rgba(13,63,57,0.24),inset_0_1px_0_rgba(255,255,255,0.12)]"
                : "border-vc-line bg-vc-paper-bright/70 hover:border-vc-ink/25 hover:bg-vc-paper"
            }`}
          >
            <span
              aria-hidden
              className={`absolute right-3 top-4 h-5 w-5 rounded-full border transition ${
                active
                  ? "border-vc-paper-bright bg-vc-paper-bright shadow-[inset_0_0_0_4px_var(--color-vc-ink-deep)]"
                  : "border-vc-ink bg-transparent"
              }`}
            />
            <span
              className={`block pr-7 vc-reading-serif text-[18px] font-semibold leading-none ${
                active ? "text-vc-paper-bright" : "text-vc-ink"
              }`}
            >
              {language === "en-US" ? englishCopy[talent.key]?.title ?? talent.title : talent.title}
            </span>
            <span
              className={`mt-2 block vc-reading-serif text-[13px] leading-none ${
                active ? "text-vc-paper-bright/80" : "text-vc-ink-soft"
              }`}
            >
              {language === "en-US" ? englishCopy[talent.key]?.cd ?? talent.cd : talent.cd}
            </span>
            <span
              className={`mt-2 block vc-reading-serif text-[13px] leading-[1.25] ${
                active ? "text-vc-paper-bright/80" : "text-vc-ink-soft"
              }`}
            >
              {language === "en-US" ? englishCopy[talent.key]?.desc ?? talent.desc : talent.desc}
            </span>
          </button>
        );
      })}
    </div>
  );
}
