"use client";

// 2026-07：此前 page.tsx 里的 firstTimeHint 状态被 53 处事件写入（获得道具、任务变化、
// 场景提示等几乎所有玩法反馈都会调用它），但从未在任何 JSX 里渲染——玩家做了动作、
// 状态其实变了，屏幕上却什么反应都没有，3 秒后又被静默清空。这是"整体感觉没反馈、
// 不知道刚才那句话算不算数"的根因之一。这个组件把它接上，做成非阻塞的轻提示。
export function PlayFeedbackToast({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div
      key={text}
      className="pointer-events-none fixed inset-x-0 top-[calc(var(--vc-mobile-header-height)+0.5rem)] z-[70] flex justify-center px-4"
    >
      <div
        data-testid="play-feedback-toast"
        className="vc-reading-serif animate-fade-in-up max-w-[92vw] rounded-full border border-vc-line-warm bg-vc-paper-bright px-4 py-2 text-center text-[13px] leading-snug text-vc-ink shadow-[0_10px_28px_rgba(73,63,51,0.16),inset_0_1px_0_rgba(255,255,255,0.9)] min-[420px]:text-[14px]"
      >
        {text}
      </div>
    </div>
  );
}
