"use client";

import type { EchoTalent } from "@/store/useGameStore";
import { TALENTS } from "./constants";

export function CreateTalentGrid({
  selectedTalent,
  onSelectTalent,
}: {
  selectedTalent: EchoTalent | null;
  onSelectTalent: (talent: EchoTalent) => void;
}) {
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
            className={`relative min-h-[72px] rounded-[14px] border px-3.5 py-3 text-left transition active:scale-[0.99] ${
              active
                ? "border-vc-ink-deep bg-vc-ink-deep vc-shadow-card"
                : "border-vc-line bg-vc-paper-bright/70 hover:bg-vc-paper"
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
              {talent.title}
            </span>
            <span
              className={`mt-2 block vc-reading-serif text-[13px] leading-none ${
                active ? "text-vc-paper-bright/80" : "text-vc-ink-soft"
              }`}
            >
              {talent.cd}
            </span>
            <span
              className={`mt-2 block vc-reading-serif text-[13px] leading-[1.25] ${
                active ? "text-vc-paper-bright/80" : "text-vc-ink-soft"
              }`}
            >
              {talent.desc}
            </span>
          </button>
        );
      })}
    </div>
  );
}
