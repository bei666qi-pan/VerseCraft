"use client";

type PlayGuideModalProps = {
  open: boolean;
  onClose: () => void;
};

export function PlayGuideModal({ open, onClose }: PlayGuideModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        aria-label="关闭游戏指南"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/45 backdrop-blur-sm"
      />
      <div className="relative w-full max-w-3xl rounded-2xl border border-white/20 bg-slate-900/92 shadow-[0_30px_90px_rgba(2,6,23,0.8)] backdrop-blur-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 sm:px-6">
          <h3 className="text-sm font-semibold uppercase tracking-widest text-slate-200">游戏指南</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
          >
            关闭
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto p-4 sm:p-6">
          <div className="space-y-6 text-sm leading-relaxed text-slate-300">
            <section className="rounded-xl border border-white/10 bg-white/5 p-4">
              <h4 className="text-sm font-semibold tracking-widest text-slate-200">30 秒快速上手</h4>
              <ul className="mt-3 list-disc space-y-1.5 pl-5 text-slate-300">
                <li>每回合你只做一件事：<span className="font-semibold text-slate-100">选一个行动</span>，让故事继续。</li>
                <li>新手优先用<span className="font-semibold text-slate-100">选项模式</span>推进；有明确想法再切<span className="font-semibold text-slate-100">手动输入</span>。</li>
                <li>遇到风险时先<span className="font-semibold text-slate-100">看信息</span>（地点 / 时间 / 任务 / 图鉴 / 背包），再决定要不要冒险。</li>
              </ul>
            </section>

            <section>
              <h4 className="text-sm font-semibold tracking-widest text-slate-200">1）这游戏怎么玩</h4>
              <p className="mt-2 text-slate-300">
                核心循环很简单：<span className="font-semibold text-slate-100">每回合选择一个行动</span> → 主笔给出剧情反馈 → 局势变化 → 进入下一回合。
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">选项模式</p>
                  <ul className="mt-2 list-disc space-y-1.5 pl-5">
                    <li>适合：刚入门、没思路、想稳稳推进。</li>
                    <li>优点：不容易做出无效操作，节奏更清晰。</li>
                  </ul>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">手动输入</p>
                  <ul className="mt-2 list-disc space-y-1.5 pl-5">
                    <li>适合：你有明确策略、想做更细的动作。</li>
                    <li>建议：一句话即可，越具体越好。</li>
                  </ul>
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-white/10 bg-white/5 p-4">
              <h4 className="text-sm font-semibold tracking-widest text-slate-200">一句话总结</h4>
              <p className="mt-2 text-slate-300">
                文界工坊的核心不是乱冲，而是<span className="font-semibold text-slate-100">读信息 → 做判断 → 再行动</span>。
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

