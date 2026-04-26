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
    <div data-testid="create-talent-grid" className="mt-7 grid grid-cols-2 border-y border-[#7f4b32]/76">
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
            className={`relative min-h-[128px] px-0 py-5 text-left transition active:scale-[0.99] ${
              isLeft ? "pr-4" : "border-l border-[#7f4b32]/76 pl-4"
            } ${isBottomRow ? "" : "border-b border-[#7f4b32]/76"}`}
          >
            <span
              aria-hidden
              className={`absolute right-3 top-5 h-5 w-5 rounded-full border transition ${
                active
                  ? "border-[#ffb767] bg-[#ff8a3d] shadow-[0_0_14px_rgba(255,138,61,0.55)]"
                  : "border-[#f07839]"
              }`}
            />
            <span className="block pr-7 vc-reading-serif text-[22px] font-semibold leading-none text-[#ffb767]">
              {talent.title}
            </span>
            <span className="mt-3 block vc-reading-serif text-[17px] leading-none text-[#d98b50]">
              {talent.cd}
            </span>
            <span className="mt-3 block vc-reading-serif text-[17px] leading-[1.5] text-[#d98b50]">
              {talent.desc}
            </span>
          </button>
        );
      })}
    </div>
  );
}
