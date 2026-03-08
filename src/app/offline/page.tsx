"use client";

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#0f172a] text-white">
      <div className="relative mb-6">
        <div className="absolute -inset-8 rounded-full bg-red-600/20 blur-2xl" aria-hidden />
        <p className="relative text-6xl font-black tracking-tighter drop-shadow-[0_0_20px_rgba(239,68,68,0.4)]">
          ⚠
        </p>
      </div>
      <h1 className="text-xl font-bold tracking-widest text-slate-200">
        连接已中断
      </h1>
      <p className="mt-3 max-w-xs text-center text-sm leading-relaxed text-slate-400">
        如月公寓的信号被深渊吞噬。请检查网络连接后重试。
      </p>
      <button
        type="button"
        onClick={() => {
          if (typeof window !== "undefined") window.location.reload();
        }}
        className="mt-8 rounded-full border border-white/20 bg-white/5 px-8 py-3 text-sm font-medium text-white backdrop-blur-md transition hover:bg-white/10"
      >
        重新连接
      </button>
    </main>
  );
}
