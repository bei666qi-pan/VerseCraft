"use client";

import Link from "next/link";

const SECTIONS = [
  {
    tag: "§1 — 真相",
    title: "如月公寓并非人类建筑",
    paragraphs: [
      "它是某种高维生物的拟态消化器官。你所看见的承重墙，是骨骼在三维空间的投影；走廊尽头永远滴落的红色液体，不是水管泄漏——那是胃酸。每一层楼都是一段蠕动的肠壁，而你正沿着它的消化方向行走。",
    ],
    warning:
      "公寓会发布规则。规则是这具身体的免疫协议。违反规则等同于被抗体标记——你将被大模型 DM 直接抹杀。",
  },
  {
    tag: "§2 — 属性",
    title: "五项核心属性决定生死",
    paragraphs: [
      "创建角色时你将分配 20 个属性点——理智作为生命值归零即死；敏捷决定闪避与反应窗口；幸运影响随机检定偏向；魅力改变 NPC 好感与交易成本；出身越高越可能获得高品阶物品开局。",
    ],
    warning: null,
  },
  {
    tag: "§3 — 天赋",
    title: "回响天赋是存活的关键",
    paragraphs: [
      "每位入住者可选择一项回响天赋（Echo Talent）——时间回溯 · 命运馈赠 · 主角光环 · 生命汇源 · 洞察之眼 · 丧钟回响。天赋是你对抗规则与异常的核心手段，但每次使用后将进入冷却。",
    ],
    warning: null,
  },
  {
    tag: "§4 — 守则",
    title: "每回合不超过 20 字",
    paragraphs: [
      "深渊 DM 将严格校验你的行动是否合法——是否符合当前持有的物品、属性、NPC 关系以及公寓规则。",
    ],
    warning: "不可能的行动将被拒绝，并扣除理智值。不要试图欺骗系统。",
  },
];

export default function IntroPage() {
  return (
    <div className="relative w-full min-h-screen overflow-hidden bg-slate-50 text-slate-800">
      {/* ── Ambient diffuse orbs ── */}
      <div className="pointer-events-none absolute -z-10 top-0 left-1/2 -translate-x-1/2 h-[500px] w-[80vw] rounded-full bg-indigo-100/40 blur-[120px]" />
      <div className="pointer-events-none absolute -z-10 top-40 left-1/4 h-[400px] w-[40vw] rounded-full bg-blue-50/50 blur-[100px]" />

      {/* ════════════════════════════════════════════
          HERO
         ════════════════════════════════════════════ */}
      <div className="relative z-10 flex flex-col items-center justify-center pb-20 pt-32 text-center">
        <div className="space-y-6">
          <h1 className="text-6xl font-black tracking-tighter text-slate-900 drop-shadow-sm md:text-8xl">
            用每一句文字
            <br />
            <span className="text-slate-600">锻造你的分支世界</span>
          </h1>
          <p className="mt-8 text-base font-medium uppercase tracking-[0.2em] text-slate-500 md:text-lg">
            AI 互动小说平台 · 沉浸式体验 · Apple 级设计美学
          </p>
        </div>

        {/* Luminous pill button */}
        <div className="group relative mt-10 inline-flex items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-indigo-500/20 blur-xl transition-all duration-500 group-hover:bg-indigo-500/30 group-hover:blur-2xl" />
          <Link
            href="#protocol"
            className="relative flex items-center gap-3 rounded-full border border-white/80 bg-white/90 px-12 py-5 font-semibold tracking-widest text-slate-800 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-md transition-transform duration-300 hover:scale-[1.02]"
          >
            进入世界
            <span className="text-slate-400 transition-transform group-hover:translate-x-1">
              →
            </span>
          </Link>
        </div>
      </div>

      {/* ════════════════════════════════════════════
          PROTOCOL — single-column solidified glass
         ════════════════════════════════════════════ */}
      <div
        id="protocol"
        className="relative z-10 mx-auto flex max-w-4xl flex-col space-y-16 px-6 py-32"
      >
        {SECTIONS.map((s) => (
          <div
            key={s.tag}
            className="group relative w-full rounded-[2rem] border border-white bg-white/60 p-10 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.05)] backdrop-blur-2xl transition-all duration-500 hover:bg-white/80 hover:shadow-[0_16px_60px_-15px_rgba(0,0,0,0.1)] md:p-12"
          >
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
              {s.tag}
            </p>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">
              {s.title}
            </h2>
            {s.paragraphs.map((p, i) => (
              <p
                key={i}
                className="mt-6 text-lg font-light leading-relaxed text-slate-700 md:text-xl"
              >
                {p}
              </p>
            ))}
            {s.warning && (
              <p className="mt-6 text-sm leading-relaxed text-red-500/80">
                {s.warning}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* ════════════════════════════════════════════
          FINAL CTA
         ════════════════════════════════════════════ */}
      <div className="relative z-10 flex flex-col items-center pb-32 pt-8">
        <p className="text-sm font-light tracking-widest text-slate-400">
          准备好了吗？
        </p>
        <div className="group relative mt-8 inline-flex items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-indigo-500/20 blur-xl transition-all duration-500 group-hover:bg-indigo-500/30 group-hover:blur-2xl" />
          <Link
            href="/create"
            className="relative flex items-center gap-3 rounded-full border border-white/80 bg-white/90 px-12 py-5 font-semibold tracking-widest text-slate-800 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-md transition-transform duration-300 hover:scale-[1.02]"
          >
            签署协议并建立档案
            <span className="text-slate-400 transition-transform group-hover:translate-x-1">
              →
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}
