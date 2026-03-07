import Link from "next/link";

export default function Home() {
  return (
    <main className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-slate-50 text-slate-800">
      {/* 环境漫反射光晕 */}
      <div className="pointer-events-none absolute -z-10 top-0 left-1/2 h-[500px] w-[80vw] -translate-x-1/2 rounded-full bg-indigo-100/40 blur-[120px]" />
      <div className="pointer-events-none absolute -z-10 bottom-0 right-1/4 h-[400px] w-[40vw] rounded-full bg-blue-50/50 blur-[100px]" />

      {/* 核心排版 */}
      <div className="z-10 flex flex-col items-center space-y-6 text-center">
        <h1 className="text-6xl font-black tracking-tighter text-slate-900 drop-shadow-sm md:text-8xl">
          用每一句文字
          <br />
          <span className="bg-gradient-to-r from-slate-600 to-slate-400 bg-clip-text text-transparent">
            锻造你的分支世界
          </span>
        </h1>
        <p className="mt-8 text-base font-medium uppercase tracking-[0.3em] text-slate-500 md:text-lg">
          AI 互动小说平台 · 沉浸式体验 · Apple 级设计美学
        </p>

        {/* 高定光感按钮 */}
        <div className="group relative mt-16 inline-flex items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-indigo-500/20 blur-xl transition-all duration-500 group-hover:bg-indigo-500/30 group-hover:blur-2xl" />
          <Link
            href="/intro"
            className="relative flex items-center gap-3 rounded-full border border-white/80 bg-white/90 px-12 py-5 font-bold tracking-widest text-slate-800 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-md transition-transform duration-300 hover:scale-[1.02]"
          >
            进入世界
            <span className="text-slate-400 transition-transform group-hover:translate-x-1">→</span>
          </Link>
        </div>
      </div>
    </main>
  );
}
