"use client";

export type ChapterPageTurnDirection = "next" | "previous" | "return";

export function ChapterPageTurnOverlay({
  active,
  direction,
}: {
  active: boolean;
  direction: ChapterPageTurnDirection;
}) {
  if (!active) return null;
  const directionClass =
    direction === "previous" ? "vc-chapter-page-turn--previous" : "vc-chapter-page-turn--next";
  return (
    <div
      data-testid="chapter-page-turn-overlay"
      data-direction={direction}
      className={`pointer-events-none fixed inset-0 z-[75] flex justify-center bg-[#ede7de]/28 ${directionClass}`}
      aria-hidden
    >
      <div className="relative h-full w-full max-w-[480px] overflow-hidden">
        <div className="vc-chapter-page-turn-sheet absolute inset-y-0 w-[68%] bg-[#fffdf8] shadow-[0_18px_44px_rgba(73,63,51,0.22)]" />
        <div className="vc-chapter-page-turn-crease absolute inset-y-0 w-[32%]" />
      </div>
    </div>
  );
}
