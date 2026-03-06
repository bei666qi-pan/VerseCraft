"use client";

import Link from "next/link";

const STATS = [
  {
    name: "理智",
    desc: "作为生命值与承压阈值。遭遇诡异与错误选择会快速削减。归零即死。",
  },
  {
    name: "敏捷",
    desc: "决定闪避、逃脱与追击中的成功率，也影响部分事件的反应窗口。",
  },
  {
    name: "幸运",
    desc: "提升收益事件与正面分支出现频率，并影响随机检定的上限偏向。",
  },
  {
    name: "魅力",
    desc: "影响 NPC 初始好感度与对话说服强度，也会改变某些交易成本。",
  },
  {
    name: "出身",
    desc: "越高越可能获得更高品阶物品开局（最高可到 A 级），也会影响规则的理解度。",
  },
];

const TALENTS = [
  "时间回溯",
  "命运馈赠",
  "主角光环",
  "生命汇源",
  "洞察之眼",
  "丧钟回响",
];

export default function IntroPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-[#FAFAFA] to-[#F4F4F5]">
      <div className="mx-auto max-w-2xl px-6 pb-40 pt-20">
        {/* ── Header ── */}
        <header className="space-y-4">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-400">
            Kisaragi Apartment · 入住须知
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 sm:text-5xl">
            入职协议与<br />世界观须知
          </h1>
          <p className="max-w-md text-base leading-relaxed text-zinc-500">
            请在签署前仔细阅读以下内容。签署即视为你已知晓一切真相，并自愿承担后果。
          </p>
        </header>

        {/* ── §1 Truth ── */}
        <section className="mt-16">
          <h2 className="text-xs font-medium uppercase tracking-[0.15em] text-zinc-400">
            §1
          </h2>
          <h3 className="mt-2 text-xl font-semibold tracking-tight text-zinc-900">
            关于「如月公寓」的真相
          </h3>
          <div className="mt-5 rounded-3xl bg-white/80 px-7 py-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl">
            <p className="text-sm leading-relaxed text-zinc-600">
              如月公寓并非人类建筑。它是某种高维生物的
              <span className="font-medium text-zinc-900">拟态消化器官</span>。
            </p>
            <p className="mt-4 text-sm leading-relaxed text-zinc-600">
              你所看见的承重墙，是骨骼在三维空间的投影；走廊尽头永远滴落的红色液体，不是水管泄漏——那是胃酸。每一层楼都是一段蠕动的肠壁，而你正沿着它的消化方向行走。
            </p>
            <div className="mt-5 rounded-2xl bg-red-50/80 px-5 py-4">
              <p className="text-sm font-medium leading-relaxed text-red-600/90">
                公寓会发布规则。规则是这具身体的免疫协议。违反规则等同于被抗体标记——你将被大模型 DM 直接抹杀。
              </p>
            </div>
          </div>
        </section>

        {/* ── §2 Stats ── */}
        <section className="mt-16">
          <h2 className="text-xs font-medium uppercase tracking-[0.15em] text-zinc-400">
            §2
          </h2>
          <h3 className="mt-2 text-xl font-semibold tracking-tight text-zinc-900">
            核心属性系统
          </h3>
          <p className="mt-3 text-sm leading-relaxed text-zinc-500">
            创建角色时，你将分配 20 个属性点到以下 5 项基础属性中。每一点都关乎生死。
          </p>

          <div className="mt-6 space-y-3">
            {STATS.map((stat) => (
              <div
                key={stat.name}
                className="flex items-start gap-4 rounded-2xl bg-white/80 px-6 py-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl"
              >
                <span className="mt-0.5 shrink-0 rounded-lg bg-zinc-100 px-3 py-1 text-sm font-medium text-zinc-800 shadow-inner">
                  {stat.name}
                </span>
                <p className="text-sm leading-relaxed text-zinc-500">
                  {stat.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── §3 Talents ── */}
        <section className="mt-16">
          <h2 className="text-xs font-medium uppercase tracking-[0.15em] text-zinc-400">
            §3
          </h2>
          <h3 className="mt-2 text-xl font-semibold tracking-tight text-zinc-900">
            回响天赋
          </h3>
          <div className="mt-5 rounded-3xl bg-white/80 px-7 py-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl">
            <p className="text-sm leading-relaxed text-zinc-600">
              每位入住者可选择一项
              <span className="font-medium text-zinc-900">回响天赋（Echo Talent）</span>。天赋是你对抗规则与异常的核心手段，但每次使用后将进入冷却。合理规划天赋使用节奏，是存活的关键。
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {TALENTS.map((t) => (
                <span
                  key={t}
                  className="rounded-lg bg-zinc-100 px-3 py-1 text-sm font-medium text-zinc-800 shadow-inner"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ── §4 Rules ── */}
        <section className="mt-16">
          <h2 className="text-xs font-medium uppercase tracking-[0.15em] text-zinc-400">
            §4
          </h2>
          <h3 className="mt-2 text-xl font-semibold tracking-tight text-zinc-900">
            行动守则
          </h3>
          <div className="mt-5 rounded-3xl bg-white/80 px-7 py-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl">
            <p className="text-sm leading-relaxed text-zinc-600">
              每回合你可输入一条不超过 20 字的行动指令。深渊 DM（大模型）将严格校验你的行动是否合法——是否符合当前持有的物品、属性、NPC 关系以及公寓规则。
            </p>
            <div className="mt-5 rounded-2xl bg-red-50/80 px-5 py-4">
              <p className="text-sm font-medium leading-relaxed text-red-600/90">
                不可能的行动将被拒绝，并扣除理智值。不要试图欺骗系统。
              </p>
            </div>
          </div>
        </section>
      </div>

      {/* ── Floating CTA Capsule ── */}
      <div className="pointer-events-none fixed bottom-0 left-0 right-0 flex justify-center pb-10">
        <Link
          href="/create"
          className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/70 px-6 py-3 text-sm font-medium text-zinc-900 shadow-2xl backdrop-blur-2xl transition-transform hover:scale-105 active:scale-[0.97]"
        >
          签署协议并建立档案
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </main>
  );
}
