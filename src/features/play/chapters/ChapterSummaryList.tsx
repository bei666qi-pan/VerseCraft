"use client";

import type { ChapterSummary } from "@/lib/chapters";

const GROUPS: Array<{ key: keyof ChapterSummary; label: string }> = [
  { key: "resultLines", label: "本章结果" },
  { key: "obtainedLines", label: "获得" },
  { key: "lostLines", label: "失去" },
  { key: "relationshipLines", label: "关系变化" },
  { key: "clueLines", label: "新线索" },
];

export function ChapterSummaryList({ summary }: { summary: ChapterSummary }) {
  return (
    <div data-testid="chapter-summary-list" className="space-y-4">
      {GROUPS.map(({ key, label }) => {
        const lines = summary[key] as string[];
        if (!Array.isArray(lines) || lines.length === 0) return null;
        return (
          <section key={key} className="space-y-2">
            <h3 className="vc-reading-serif text-[19px] font-semibold leading-none text-[#ffd08b]">
              {label}
            </h3>
            <ul className="space-y-1.5">
              {lines.map((line) => (
                <li key={line} className="vc-reading-serif text-[16px] leading-relaxed text-[#e7bb8f]">
                  {line}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <section className="space-y-2 border-t border-[#b98563]/25 pt-4">
        <h3 className="vc-reading-serif text-[19px] font-semibold leading-none text-[#ffd08b]">
          下一目标
        </h3>
        <p className="vc-reading-serif text-[16px] leading-relaxed text-[#e7bb8f]">
          {summary.nextObjective}
        </p>
        <p className="vc-reading-serif text-[16px] leading-relaxed text-[#ffbd7d]">
          {summary.hook}
        </p>
      </section>
    </div>
  );
}
