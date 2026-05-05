"use client";

export function PlayComplianceToast({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="pointer-events-none fixed left-1/2 top-1/2 z-[80] w-[min(86vw,560px)] -translate-x-1/2 -translate-y-1/2">
      <div
        data-testid="play-compliance-paper-card"
        className="rounded-[24px] border border-[#ded8ce] bg-[#fffdf8]/96 px-6 py-8 text-center text-[#0f6a60] shadow-[0_28px_70px_rgba(72,60,45,0.22),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-[6px]"
      >
        <div className="mx-auto mb-7 flex w-[46%] items-center justify-center gap-3">
          <span className="h-px flex-1 bg-[#d8d1c6]" />
          <span className="h-2 w-2 rotate-45 border border-[#8fb1aa]" />
          <span className="h-px flex-1 bg-[#d8d1c6]" />
        </div>
        <p className="vc-reading-serif text-[clamp(1.18rem,4.6vw,1.6rem)] leading-[2.05] tracking-normal">
          本平台为AI协作创意写作工具，请创作者遵守
          <br />
          中国法律法规，严禁输入或引导生成涉黄、涉政、涉暴等违规内容。
        </p>
        <div className="mx-auto mt-7 flex w-[46%] items-center justify-center gap-3">
          <span className="h-px flex-1 bg-[#d8d1c6]" />
          <span className="h-2 w-2 rotate-45 border border-[#8fb1aa]" />
          <span className="h-px flex-1 bg-[#d8d1c6]" />
        </div>
      </div>
    </div>
  );
}
