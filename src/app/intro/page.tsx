"use client";

import { useRouter } from "next/navigation";
import { GlassCtaButton } from "@/components/GlassCtaButton";

const RULES: { title: string }[] = [
  { title: "诡异类型世界，微恐，难度高" },
  { title: "左上角的设置里是「一切创作设定」的入口" },
  { title: "右上角的键盘按钮可切换至手动输入" },
];

export default function IntroPage() {
  const router = useRouter();

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-100 text-slate-800">
      {/* 背景光晕 */}
      <div
        className="pointer-events-none absolute -z-10 top-[-10%] left-[5%] h-[520px] w-[520px] rounded-full bg-[radial-gradient(ellipse_80%_80%_at_50%_50%,oklch(0.96_0.03_210/0.6)_0%,transparent_70%)] animate-[haloFloat_14s_ease-in-out_infinite]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -z-10 bottom-[-10%] right-[8%] h-[480px] w-[480px] rounded-full bg-[radial-gradient(ellipse_80%_80%_at_50%_50%,oklch(0.95_0.04_330/0.5)_0%,transparent_70%)] animate-[haloFloat_18s_ease-in-out_infinite_reverse]"
        aria-hidden
      />

      {/* 返回首页 */}
      <button
        type="button"
        onClick={() => router.push("/")}
        className="fixed left-4 top-4 z-20 inline-flex items-center gap-2.5 rounded-full border border-slate-200/80 bg-white/95 px-4 py-2 text-sm font-medium text-slate-700 shadow-[0_12px_36px_rgba(148,163,184,0.4)] backdrop-blur-md transition hover:bg-white hover:shadow-[0_16px_48px_rgba(148,163,184,0.55)] sm:left-6 sm:top-6"
        style={{ top: "max(1rem, env(safe-area-inset-top))" }}
      >
        <span className="text-base text-slate-400">←</span>
        <span>返回首页</span>
      </button>

      {/* 中央丝滑浮现卡片（右侧切入，时长略拉长便于感知） */}
      <div className="relative z-10 mx-4 w-full max-w-xl animate-[fadeInRight_1.2s_ease-out_forwards]">
        <div className="rounded-3xl border border-slate-200/80 bg-white/95 px-5 py-6 shadow-[0_26px_80px_rgba(15,23,42,0.35)] backdrop-blur-2xl sm:px-7 sm:py-7">
          <header className="text-center">
            <h1 className="text-xl font-bold tracking-[0.24em] text-slate-900 sm:text-2xl sm:tracking-[0.3em]">
              如月公寓
            </h1>
          </header>

          <section className="mt-6 space-y-4 sm:mt-7 sm:space-y-5">
            {RULES.map((rule) => (
              <div
                key={rule.title}
                className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 shadow-sm sm:px-5 sm:py-4"
              >
                <h2 className="text-sm font-semibold tracking-wide text-slate-800 sm:text-base">
                  {rule.title}
                </h2>
              </div>
            ))}
          </section>

          <footer className="mt-7 flex flex-col items-center gap-3 sm:mt-8">
            <p className="text-xs text-slate-500 sm:text-sm">
              祝各位内测用户执笔顺利。
            </p>
            <GlassCtaButton
              label="创建形象"
              onClick={() => router.push("/create")}
            />
          </footer>
        </div>
        <section
          className="mx-auto mt-4 max-w-[92%] px-1 text-[11px] leading-relaxed text-slate-500/75 sm:mt-5 sm:text-xs"
          aria-label="免责声明"
        >
          <p>
            本系统接入生成式人工智能，文本与剧情为 AI 生成，仅供娱乐参考，不代表平台立场。
          </p>
          <p className="mt-2">
            《文界工坊》含悬疑与超现实虚构内容，请勿与现实混淆或模仿；如感不适，请立即停止体验。
          </p>
          <p className="mt-2">
            请对交互指令负责，严禁输入违法违规内容；系统已启用违规拦截与必要记录机制。
          </p>
        </section>
      </div>
    </main>
  );
}
