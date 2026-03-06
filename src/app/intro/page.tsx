"use client";

import Link from "next/link";

const SECTIONS = [
  {
    tag: "§1 — 真相",
    title: "如月公寓并非人类建筑",
    body: "它是某种高维生物的拟态消化器官。你所看见的承重墙，是骨骼在三维空间的投影；走廊尽头永远滴落的红色液体，不是水管泄漏——那是胃酸。每一层楼都是一段蠕动的肠壁，而你正沿着它的消化方向行走。",
    warning:
      "公寓会发布规则。规则是这具身体的免疫协议。违反规则等同于被抗体标记——你将被大模型 DM 直接抹杀。",
  },
  {
    tag: "§2 — 属性",
    title: "五项核心属性决定生死",
    body: "创建角色时你将分配 20 个属性点——理智作为生命值归零即死；敏捷决定闪避与反应窗口；幸运影响随机检定偏向；魅力改变 NPC 好感与交易成本；出身越高越可能获得高品阶物品开局。",
    warning: null,
  },
  {
    tag: "§3 — 天赋",
    title: "回响天赋是存活的关键",
    body: "每位入住者可选择一项回响天赋（Echo Talent）——时间回溯 · 命运馈赠 · 主角光环 · 生命汇源 · 洞察之眼 · 丧钟回响。天赋是你对抗规则与异常的核心手段，但每次使用后将进入冷却。",
    warning: null,
  },
  {
    tag: "§4 — 守则",
    title: "每回合不超过 20 字",
    body: "深渊 DM 将严格校验你的行动是否合法——是否符合当前持有的物品、属性、NPC 关系以及公寓规则。",
    warning: "不可能的行动将被拒绝，并扣除理智值。不要试图欺骗系统。",
  },
];

export default function IntroPage() {
  return (
    <main className="relative flex w-full min-h-screen flex-col items-center overflow-hidden bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-[#ffffff] via-[#f4f4f5] to-[#e4e4e7] bg-[length:200%_200%] animate-mesh-gradient">
      {/* ── Noise grain overlay ── */}
      <div className="pointer-events-none absolute inset-0 z-0 bg-noise opacity-[0.03] mix-blend-multiply" />

      {/* ════════════════════════════════════════════
          HERO — full-viewport cinematic opening
         ════════════════════════════════════════════ */}
      <section className="relative z-10 flex min-h-screen w-full flex-col items-center justify-center px-6">
        {/* Title block with hover shimmer */}
        <div className="mt-32 space-y-4 text-center">
          <h1 className="group relative text-6xl font-black tracking-tighter text-zinc-900 md:text-8xl">
            <span className="relative z-10">用每一句文字</span>
            <span className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(110deg,transparent_25%,rgba(255,255,255,0.6)_50%,transparent_75%)] bg-[length:250%_100%] bg-clip-text opacity-0 transition-opacity duration-700 group-hover:animate-shimmer group-hover:opacity-100" />
          </h1>
          <p className="text-6xl font-black tracking-tighter md:text-8xl">
            <span className="bg-gradient-to-r from-zinc-600 to-zinc-400 bg-clip-text text-transparent">
              锻造你的分支世界
            </span>
          </p>
        </div>

        {/* Slogan */}
        <p className="mt-12 text-center text-lg font-light uppercase tracking-[0.3em] text-zinc-500 md:text-2xl">
          AI 互动小说平台 · 沉浸式体验 · Apple 级设计美学
        </p>

        {/* Liquid glass CTA */}
        <Link
          href="#protocol"
          className="group relative mt-20 inline-flex items-center justify-center gap-3 rounded-full px-12 py-5 text-lg font-medium text-zinc-900 transition-all duration-500 hover:scale-105 hover:shadow-[0_10px_40px_-10px_rgba(0,0,0,0.1)]"
        >
          <span className="absolute inset-0 rounded-full border border-white/60 bg-white/40 shadow-[inset_0_-2px_4px_rgba(0,0,0,0.02)] backdrop-blur-xl" />
          <span className="absolute inset-0 rounded-full bg-[linear-gradient(110deg,transparent_25%,rgba(255,255,255,0.7)_50%,transparent_75%)] opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
          <span className="relative z-10">进入世界</span>
          <span className="relative z-10 inline-block transition-transform duration-300 group-hover:translate-x-1">
            →
          </span>
        </Link>

        {/* Scroll hint — pulsing tech line */}
        <div className="absolute bottom-12 flex flex-col items-center gap-3">
          <span className="text-[10px] uppercase tracking-[0.25em] text-zinc-400">
            scroll
          </span>
          <div className="h-10 w-px origin-top animate-pulse-line bg-gradient-to-b from-zinc-400 to-transparent" />
        </div>
      </section>

      {/* ════════════════════════════════════════════
          PROTOCOL — neo-glassmorphism 2-col grid
         ════════════════════════════════════════════ */}
      <div
        id="protocol"
        className="relative z-10 grid w-full max-w-6xl grid-cols-1 gap-10 px-6 py-32 md:grid-cols-2 md:gap-8 md:px-10"
      >
        {SECTIONS.map((s, i) => (
          <section
            key={s.tag}
            className="group relative rounded-[2rem] bg-white/40 p-10 backdrop-blur-2xl transition-all duration-700 hover:-translate-y-2"
            style={{ animationDelay: `${i * 120}ms` }}
          >
            {/* Glass border + hover glow */}
            <div className="-z-10 absolute inset-0 rounded-[2rem] border border-white/60 shadow-[0_8px_32px_rgba(0,0,0,0.02)] transition-all duration-700 group-hover:bg-white/60 group-hover:shadow-[0_16px_48px_rgba(0,0,0,0.05)]" />

            {/* Section label */}
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">
              {s.tag}
            </p>

            {/* Gradient accent line */}
            <div className="mt-3 h-px w-12 bg-gradient-to-r from-zinc-400 to-transparent" />

            {/* Title */}
            <h2 className="mt-5 text-xl font-semibold tracking-tight text-zinc-900 md:text-2xl">
              {s.title}
            </h2>

            {/* Body */}
            <p className="mt-5 text-base font-light leading-relaxed text-zinc-600">
              {s.body}
            </p>

            {/* Warning */}
            {s.warning && (
              <p className="mt-5 text-sm leading-relaxed text-red-500/80">
                {s.warning}
              </p>
            )}
          </section>
        ))}
      </div>

      {/* ════════════════════════════════════════════
          FINAL CTA
         ════════════════════════════════════════════ */}
      <section className="relative z-10 flex w-full flex-col items-center pb-32 pt-8">
        <p className="text-sm font-light tracking-widest text-zinc-400">
          准备好了吗？
        </p>
        <Link
          href="/create"
          className="group relative mt-8 inline-flex items-center justify-center gap-3 rounded-full px-12 py-5 text-lg font-medium text-zinc-900 transition-all duration-500 hover:scale-105 hover:shadow-[0_10px_40px_-10px_rgba(0,0,0,0.1)]"
        >
          <span className="absolute inset-0 rounded-full border border-white/60 bg-white/40 shadow-[inset_0_-2px_4px_rgba(0,0,0,0.02)] backdrop-blur-xl" />
          <span className="absolute inset-0 rounded-full bg-[linear-gradient(110deg,transparent_25%,rgba(255,255,255,0.7)_50%,transparent_75%)] opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
          <span className="relative z-10">签署协议并建立档案</span>
          <span className="relative z-10 inline-block transition-transform duration-300 group-hover:translate-x-1">
            →
          </span>
        </Link>
      </section>
    </main>
  );
}
