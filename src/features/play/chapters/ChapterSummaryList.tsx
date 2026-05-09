"use client";

import type { ChapterSummary } from "@/lib/chapters";

const BLOCKED_PLAYER_TEXT = [
  "\u672c\u7ae0\u5b8c\u6210",
  "\u83b7\u5f97",
  "\u5931\u53bb",
  "\u5173\u7cfb\u53d8\u5316",
  "\u4efb\u52a1\u5b8c\u6210",
  "\u7ae0\u8282\u8fdb\u5ea6",
  "\u884c\u52a8\u7ed3\u7b97",
];

function cleanParagraph(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function isSafeRecapLine(line: string): boolean {
  if (!line) return false;
  if (/\u7406\u667a\s*[-+]\s*\d+/.test(line)) return false;
  return !BLOCKED_PLAYER_TEXT.some((word) => line.includes(word));
}

function splitParagraphs(value: string): string[] {
  return value
    .split(/\n{2,}|(?<=[。！？!?])\s+/)
    .map(cleanParagraph)
    .filter(isSafeRecapLine)
    .slice(0, 3);
}

function getRecapParagraphs(summary: ChapterSummary): string[] {
  const direct = splitParagraphs(summary.summaryForPlayer ?? "");
  if (direct.length > 0) return direct;

  const fallbackSource = [
    ...(Array.isArray(summary.resultLines) ? summary.resultLines : []),
    ...(Array.isArray(summary.clueLines) ? summary.clueLines : []),
    summary.hook,
  ];
  const fallback = splitParagraphs(fallbackSource.map(cleanParagraph).filter(Boolean).join(" "));
  if (fallback.length > 0) return fallback.slice(0, 2);

  return ["这一章的回声还停在纸页之间，等你回到正文时，它会继续把故事推向下一处暗处。"];
}

export function ChapterSummaryList({ summary }: { summary: ChapterSummary }) {
  const paragraphs = getRecapParagraphs(summary);
  return (
    <section data-testid="chapter-summary-list" className="space-y-3" aria-label="章节留页">
      <h3 className="vc-reading-serif text-[19px] font-semibold leading-none text-[#174d46]">
        章节留页
      </h3>
      <div className="space-y-3">
        {paragraphs.map((line, index) => (
          <p key={`${index}-${line}`} className="vc-reading-serif text-[16px] leading-relaxed text-[#4f706a]">
            {line}
          </p>
        ))}
      </div>
    </section>
  );
}
