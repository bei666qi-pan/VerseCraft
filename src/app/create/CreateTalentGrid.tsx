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
    <div data-testid="create-talent-grid" className="mt-4 grid grid-cols-2 border-y border-[#d8d3ca]">
      {TALENTS.map((talent, index) => {
        const active = selectedTalent === talent.key;
        const isLeft = index % 2 === 0;
        const isBottomRow = index >= TALENTS.length - 2;
        return (
          <button
            key={talent.key}
            type="button"
            data-testid={`create-talent-${talent.key}`}
            aria-pressed={active}
            onClick={() => onSelectTalent(talent.key)}
            className={`relative min-h-[72px] px-0 py-3 text-left transition active:scale-[0.99] ${
              isLeft ? "pr-4" : "border-l border-[#d8d3ca] pl-4"
            } ${isBottomRow ? "" : "border-b border-[#d8d3ca]"}`}
          >
            <span
              aria-hidden
              className={`absolute right-3 top-5 h-5 w-5 rounded-full border transition ${
                active
                  ? "border-[#164f4d] bg-[#164f4d] shadow-[inset_0_0_0_4px_#f7f3ec]"
                  : "border-[#164f4d] bg-transparent"
              }`}
            />
            <span className="block pr-7 vc-reading-serif text-[18px] font-semibold leading-none text-[#164f4d]">
              {talent.title}
            </span>
            <span className="mt-2 block vc-reading-serif text-[13px] leading-none text-[#365f5d]">
              {talent.cd}
            </span>
            <span className="mt-2 block vc-reading-serif text-[13px] leading-[1.25] text-[#365f5d]">
              {talent.desc}
            </span>
          </button>
        );
      })}
    </div>
  );
}
