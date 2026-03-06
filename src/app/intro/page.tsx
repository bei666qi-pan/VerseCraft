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
      {/* ════════════════════════════════════════════
          HERO — full-width cinematic opening
         ════════════════════════════════════════════ */}
      <section className="flex min-h-screen w-full flex-col items-center justify-center px-6">
        {/* Title block */}
        <div className="mt-32 space-y-4 text-center">
          <h1 className="text-6xl font-black tracking-tighter text-zinc-900 md:text-8xl">
            用每一句文字
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

        {/* Liquid glass button */}
        <Link
          href="#protocol"
          className="group relative mt-20 inline-flex items-center justify-center gap-3 rounded-full px-12 py-5 text-lg font-medium text-zinc-900 transition-all duration-500 hover:scale-105 hover:shadow-[0_10px_40px_-10px_rgba(0,0,0,0.1)]"
        >
          {/* Glass substrate */}
          <span className="absolute inset-0 rounded-full border border-white/60 bg-white/40 shadow-[inset_0_-2px_4px_rgba(0,0,0,0.02)] backdrop-blur-xl" />
          {/* Hover caustic */}
          <span className="absolute inset-0 rounded-full bg-gradient-to-tr from-transparent via-white/80 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
          {/* Label */}
          <span className="relative z-10">进入世界</span>
          <span className="relative z-10 inline-block transition-transform duration-300 group-hover:translate-x-1">
            →
          </span>
        </Link>

        {/* Scroll hint */}
        <div className="absolute bottom-10 flex flex-col items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.25em] text-zinc-300">
            scroll
          </span>
          <div className="h-8 w-px bg-zinc-200" />
        </div>
      </section>

      {/* ════════════════════════════════════════════
          PROTOCOL — wide 2-col grid, no max-w-3xl
         ════════════════════════════════════════════ */}
      <div
        id="protocol"
        className="grid w-full max-w-5xl grid-cols-1 gap-24 px-8 py-40 md:grid-cols-2"
      >
        {SECTIONS.map((s) => (
          <section key={s.tag}>
            <p className="mb-4 text-xs uppercase tracking-[0.2em] text-zinc-400">
              {s.tag}
            </p>
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 md:text-3xl">
              {s.title}
            </h2>
            <p className="mt-6 text-lg font-light leading-relaxed text-zinc-600">
              {s.body}
            </p>
            {s.warning && (
              <p className="mt-6 text-sm leading-relaxed text-red-500/80">
                {s.warning}
              </p>
            )}
          </section>
        ))}
      </div>

      {/* ════════════════════════════════════════════
          FINAL CTA
         ════════════════════════════════════════════ */}
      <section className="flex w-full flex-col items-center pb-32 pt-8">
        <p className="text-sm font-light tracking-widest text-zinc-400">
          准备好了吗？
        </p>
        <Link
          href="/create"
          className="group relative mt-8 inline-flex items-center justify-center gap-3 rounded-full px-12 py-5 text-lg font-medium text-zinc-900 transition-all duration-500 hover:scale-105 hover:shadow-[0_10px_40px_-10px_rgba(0,0,0,0.1)]"
        >
          <span className="absolute inset-0 rounded-full border border-white/60 bg-white/40 shadow-[inset_0_-2px_4px_rgba(0,0,0,0.02)] backdrop-blur-xl" />
          <span className="absolute inset-0 rounded-full bg-gradient-to-tr from-transparent via-white/80 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
          <span className="relative z-10">签署协议并建立档案</span>
          <span className="relative z-10 inline-block transition-transform duration-300 group-hover:translate-x-1">
            →
          </span>
        </Link>
      </section>
    </main>
  );
}
