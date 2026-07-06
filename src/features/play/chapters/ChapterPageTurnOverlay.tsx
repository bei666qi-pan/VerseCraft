"use client";

export type ChapterPageTurnDirection = "next" | "previous" | "return";

/**
 * 章节切换时的全屏翻页遮罩。用一张自带光影渐变的"纸片"做 3D rotateY 卷页
 * （书脊在页面外侧、随动画卷起再落下），配合独立的接触阴影层和卷起高光层，
 * 模拟真实翻书的立体感。纯 CSS 动画、自动播放，不依赖手指拖拽。
 *
 * 外部契约保持不变：`data-testid="chapter-page-turn-overlay"` 与 `active`/`direction`
 * 语义与此前一致，`page.tsx` 里 620ms 的卸载计时无需调整（动画总时长 600ms）。
 */
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
      className={`vc-chapter-page-turn-stage pointer-events-none fixed inset-0 z-[75] flex justify-center bg-[#ede7de]/25 ${directionClass}`}
      aria-hidden
    >
      <div className="relative h-full w-full max-w-[480px] overflow-hidden">
        <div className="vc-cpt-shadow" />
        <div className="vc-cpt-page">
          <div className="vc-cpt-sheen" />
        </div>
      </div>
    </div>
  );
}
