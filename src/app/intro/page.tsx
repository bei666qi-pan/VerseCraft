"use client";

import Link from "next/link";

const SECTIONS = [
  {
    tag: "§1 — 真相",
    title: "如月公寓并非人类建筑",
    paragraphs: [
      "它是折叠在三维空间的高维生命体。地上 7 层，每层盘踞一只遵循固定杀人规则的诡异。",
      "你在 B1 层苏醒——唯一的绝对安全区。更深的 B2 层，某种超越认知的存在把守着唯一出口……",
      "活下去的关键：每只诡异都有致命弱点。利用场景、道具或 NPC 情报找到它，针对弱点行动可极大提高击杀成功率。",
    ],
    warning: null,
  },
  {
    tag: "§2 — 属性",
    title: "五项属性决定生死",
    paragraphs: [
      "理智即血条，归零即死。敏捷决定闪避，幸运偏向随机事件，魅力影响 NPC 交易与好感，出身决定开局财富与物品品阶。",
    ],
    warning: null,
  },
  {
    tag: "§3 — 天赋",
    title: "回响天赋是存活的关键",
    paragraphs: [
      "选择一项：时间回溯 · 命运馈赠 · 主角光环 · 生命汇源 · 洞察之眼 · 丧钟回响。天赋可对抗规则与异常，每次使用后进入冷却。",
    ],
    warning: null,
  },
  {
    tag: "§4 — 守则",
    title: "每回合不超过 20 字",
    paragraphs: [
      "深渊 DM 会严格校验你的行动：是否持有对应物品、是否符合属性与 NPC 关系、是否违反公寓规则。",
    ],
    warning: "违规行动将被拒绝并扣除理智。不要欺骗系统。",
  },
];

export default function IntroPage() {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-slate-50 text-slate-800">
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

      <h1 className="relative z-10 mt-20 mb-12 text-center text-3xl font-bold tracking-widest text-slate-800">
        如月公寓入职协议
      </h1>

      <div className="relative z-10 mx-auto flex max-w-4xl flex-col space-y-16 px-6 pb-20">
        {SECTIONS.map((s) => (
          <div
            key={s.tag}
            className="group relative w-full rounded-[2rem] border border-white/60 bg-white/40 p-10 shadow-[inset_0_1px_1px_rgba(255,255,255,1)] backdrop-blur-3xl transition-all duration-500 hover:bg-white/50 hover:shadow-[inset_0_1px_1px_rgba(255,255,255,1),0_8px_32px_-12px_rgba(0,0,0,0.06)] md:p-12"
          >
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
              {s.tag}
            </p>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-800 md:text-3xl">
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
              <p className="mt-6 text-sm leading-relaxed text-red-500/90">
                {s.warning}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="relative z-10 flex flex-col items-center pb-32 pt-8">
        <p className="text-sm font-light tracking-widest text-slate-500">
          准备好了吗？
        </p>
        <div className="group relative mt-8 inline-flex items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-indigo-500/20 blur-xl transition-all duration-500 group-hover:bg-indigo-500/30 group-hover:blur-2xl" />
          <Link
            href="/create"
            className="relative flex items-center gap-3 rounded-full border border-white/60 bg-white/40 px-12 py-5 font-semibold tracking-widest text-slate-800 shadow-[inset_0_1px_1px_rgba(255,255,255,1)] backdrop-blur-3xl transition-all duration-300 hover:scale-[1.02] hover:bg-white/50"
          >
            签署协议并建立档案 →
          </Link>
        </div>
      </div>
    </div>
  );
}
