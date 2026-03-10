"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GlassCtaButton } from "@/components/GlassCtaButton";

const RULES: { tag: string; title: string; paragraphs: string[]; warning: string | null }[] = [
  {
    tag: "规则一",
    title: "如月公寓并非人类建筑",
    paragraphs: [
      "它是折叠在三维空间的高维生命体。地上 7 层，每层盘踞一只遵循固定杀人规则的诡异。",
      "你在 B1 层苏醒——唯一的绝对安全区。更深的 B2 层，某种超越认知的存在把守着唯一出口……",
      "活下去的关键：每只诡异都有致命弱点。利用场景、道具或 NPC 情报找到它，针对弱点行动可极大提高击杀成功率。",
    ],
    warning: null,
  },
  {
    tag: "规则二",
    title: "五项属性决定生死",
    paragraphs: [
      "理智即血条，归零即死。敏捷决定闪避，幸运偏向随机事件，魅力影响 NPC 交易与好感，出身决定开局财富与物品品阶。",
    ],
    warning: null,
  },
  {
    tag: "规则三",
    title: "回响天赋是存活的关键",
    paragraphs: [
      "选择一项：时间回溯 · 命运馈赠 · 主角光环 · 生命汇源 · 洞察之眼 · 丧钟回响。天赋可对抗规则与异常，每次使用后进入冷却。",
    ],
    warning: null,
  },
  {
    tag: "规则四",
    title: "每回合不超过 20 字",
    paragraphs: [
      "深渊 DM 会严格校验你的行动：是否持有对应物品、是否符合属性与 NPC 关系、是否违反公寓规则。",
    ],
    warning: "违规行动将被拒绝并扣除理智。不要欺骗系统。",
  },
];

export default function IntroPage() {
  const router = useRouter();
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-slate-50 text-slate-800">
      {/* 神圣诡异光晕 - 呼吸浮动 */}
      <div
        className="pointer-events-none absolute -z-10 top-[10%] left-[5%] h-[600px] w-[600px] rounded-full bg-cyan-200/40 blur-[140px] animate-[haloFloat_12s_ease-in-out_infinite]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -z-10 bottom-[20%] right-[10%] h-[500px] w-[500px] rounded-full bg-purple-200/40 blur-[120px] animate-[haloFloat_14s_ease-in-out_infinite]"
        style={{ animationDelay: "-3s" }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -z-10 top-1/2 left-1/2 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-200/30 blur-[100px] animate-[ambientDrift_16s_ease-in-out_infinite]"
        aria-hidden
      />

      {/* 顶部固定标题区 */}
      <header className="shrink-0 px-4 pt-8 pb-4">
        <h1 className="text-center text-2xl font-bold tracking-[0.25em] text-slate-800 md:text-3xl md:tracking-[0.35em]">
          如月公寓入职协议
        </h1>
      </header>

      {/* 中间自适应滚动区 */}
      <main className="touch-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6" style={{ WebkitOverflowScrolling: "touch" } as React.CSSProperties}>
        <div className="space-y-2">
          {RULES.map((r, i) => (
            <div
              key={r.tag}
              className="rounded-2xl border border-white/60 bg-white/40 shadow-[inset_0_1px_1px_rgba(255,255,255,0.9)] backdrop-blur-2xl transition-all duration-300 hover:bg-white/50"
            >
              <button
                type="button"
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                className="flex w-full cursor-pointer items-center justify-between gap-4 px-5 py-4 text-left"
                aria-expanded={openIndex === i}
              >
                <span className="text-sm font-bold uppercase tracking-[0.2em] text-slate-500">
                  {r.tag}
                </span>
                <span className="flex-1 text-lg font-bold tracking-widest text-slate-800 md:text-xl">
                  {r.title}
                </span>
                <span
                  className={`shrink-0 text-slate-400 transition-transform duration-300 ${openIndex === i ? "rotate-180" : ""}`}
                  aria-hidden
                >
                  ▼
                </span>
              </button>

              <div
                className={`grid transition-[grid-template-rows,opacity,margin] duration-500 ease-in-out ${openIndex === i ? "grid-rows-[1fr] opacity-100 mt-2" : "grid-rows-[0fr] opacity-0 mt-0"}`}
              >
                <div className="min-h-0 overflow-hidden">
                  <div className="border-t border-white/30 px-5 pb-4 pt-3">
                    <div className="space-y-3 text-sm leading-relaxed text-slate-600 md:text-base">
                      {r.paragraphs.map((p, j) => (
                        <p key={j}>{p}</p>
                      ))}
                    </div>
                    {r.warning && (
                      <p className="mt-3 text-sm leading-relaxed text-red-500/90">
                        {r.warning}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* 底部固定 CTA - 与 create 意识潜入严格统一 */}
      <footer className="shrink-0 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <GlassCtaButton
          label="签署协议"
          onClick={() => router.push("/create")}
        />
      </footer>
    </div>
  );
}
