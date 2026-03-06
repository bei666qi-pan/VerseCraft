"use client";

import Link from "next/link";

export default function IntroPage() {
  return (
    <main className="bg-[#FCFCFC]">
      {/* ════════════════════════════════════════════
          HERO — 100vh cinematic centred opening
         ════════════════════════════════════════════ */}
      <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden">
        {/* Play button */}
        <div className="flex h-20 w-20 cursor-pointer items-center justify-center rounded-full bg-zinc-500/90 shadow-2xl backdrop-blur-md transition-transform duration-500 hover:scale-105">
          <svg
            viewBox="0 0 24 24"
            fill="white"
            className="ml-1 h-8 w-8"
            aria-hidden="true"
          >
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>

        {/* Title */}
        <h1 className="mt-12 text-6xl font-bold tracking-tighter text-zinc-900 md:text-8xl">
          文界工坊
        </h1>

        {/* English subtitle */}
        <p className="mt-6 text-sm uppercase tracking-[0.4em] text-zinc-400 md:text-base">
          VERSECRAFT
        </p>

        {/* Slogan */}
        <p className="mt-8 text-lg font-light tracking-widest text-zinc-500">
          锻造可能，实现幻想。
        </p>

        {/* CTA capsule */}
        <Link
          href="#protocol"
          className="group mt-16 flex items-center gap-3 rounded-full bg-zinc-900 px-10 py-4 text-sm tracking-widest text-white transition-all duration-500 hover:bg-zinc-800 hover:shadow-2xl"
        >
          阅读入住协议
          <span className="inline-block transition-transform duration-300 group-hover:translate-x-1">
            ↓
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
          PROTOCOL — borderless typographic sections
         ════════════════════════════════════════════ */}
      <div
        id="protocol"
        className="mx-auto w-full max-w-3xl space-y-32 px-6 py-32"
      >
        {/* §1 */}
        <section>
          <p className="mb-4 text-xs uppercase tracking-[0.2em] text-zinc-400">
            §1 — 真相
          </p>
          <h2 className="text-3xl font-semibold tracking-tight text-zinc-900 md:text-4xl">
            如月公寓并非人类建筑
          </h2>
          <p className="mt-8 text-xl font-light leading-relaxed text-zinc-800 md:text-2xl">
            它是某种高维生物的
            <span className="border-b border-zinc-200 pb-1 font-medium text-zinc-900">
              拟态消化器官
            </span>
            。你所看见的承重墙，是骨骼在三维空间的投影；走廊尽头永远滴落的红色液体，不是水管泄漏——那是胃酸。
          </p>
          <p className="mt-6 text-xl font-light leading-relaxed text-zinc-800 md:text-2xl">
            每一层楼都是一段蠕动的肠壁，而你正沿着它的消化方向行走。
          </p>
          <p className="mt-8 text-base leading-relaxed text-red-500/80">
            公寓会发布规则。规则是这具身体的免疫协议。违反规则等同于被抗体标记——你将被大模型 DM 直接抹杀。
          </p>
        </section>

        {/* §2 */}
        <section>
          <p className="mb-4 text-xs uppercase tracking-[0.2em] text-zinc-400">
            §2 — 属性
          </p>
          <h2 className="text-3xl font-semibold tracking-tight text-zinc-900 md:text-4xl">
            五项核心属性
          </h2>
          <p className="mt-6 text-lg font-light leading-relaxed text-zinc-500">
            创建角色时，你将分配 20 个属性点。每一点都关乎生死。
          </p>

          <dl className="mt-12 space-y-10">
            <div>
              <dt className="border-b border-zinc-200 pb-1 font-medium text-zinc-900">
                理智
              </dt>
              <dd className="mt-3 text-lg font-light leading-relaxed text-zinc-600">
                作为生命值与承压阈值。遭遇诡异与错误选择会快速削减。归零即死。
              </dd>
            </div>
            <div>
              <dt className="border-b border-zinc-200 pb-1 font-medium text-zinc-900">
                敏捷
              </dt>
              <dd className="mt-3 text-lg font-light leading-relaxed text-zinc-600">
                决定闪避、逃脱与追击中的成功率，也影响部分事件的反应窗口。
              </dd>
            </div>
            <div>
              <dt className="border-b border-zinc-200 pb-1 font-medium text-zinc-900">
                幸运
              </dt>
              <dd className="mt-3 text-lg font-light leading-relaxed text-zinc-600">
                提升收益事件与正面分支出现频率，并影响随机检定的上限偏向。
              </dd>
            </div>
            <div>
              <dt className="border-b border-zinc-200 pb-1 font-medium text-zinc-900">
                魅力
              </dt>
              <dd className="mt-3 text-lg font-light leading-relaxed text-zinc-600">
                影响 NPC 初始好感度与对话说服强度，也会改变某些交易成本。
              </dd>
            </div>
            <div>
              <dt className="border-b border-zinc-200 pb-1 font-medium text-zinc-900">
                出身
              </dt>
              <dd className="mt-3 text-lg font-light leading-relaxed text-zinc-600">
                越高越可能获得更高品阶物品开局（最高可到 A 级），也会影响规则的理解度。
              </dd>
            </div>
          </dl>
        </section>

        {/* §3 */}
        <section>
          <p className="mb-4 text-xs uppercase tracking-[0.2em] text-zinc-400">
            §3 — 天赋
          </p>
          <h2 className="text-3xl font-semibold tracking-tight text-zinc-900 md:text-4xl">
            回响天赋
          </h2>
          <p className="mt-8 text-xl font-light leading-relaxed text-zinc-800 md:text-2xl">
            每位入住者可选择一项
            <span className="border-b border-zinc-200 pb-1 font-medium text-zinc-900">
              回响天赋
            </span>
            。天赋是你对抗规则与异常的核心手段，但每次使用后将进入冷却。
          </p>
          <p className="mt-6 text-lg font-light leading-relaxed text-zinc-600">
            时间回溯 · 命运馈赠 · 主角光环 · 生命汇源 · 洞察之眼 · 丧钟回响
          </p>
          <p className="mt-4 text-base font-light leading-relaxed text-zinc-500">
            合理规划天赋使用节奏，是存活的关键。
          </p>
        </section>

        {/* §4 */}
        <section>
          <p className="mb-4 text-xs uppercase tracking-[0.2em] text-zinc-400">
            §4 — 守则
          </p>
          <h2 className="text-3xl font-semibold tracking-tight text-zinc-900 md:text-4xl">
            行动守则
          </h2>
          <p className="mt-8 text-xl font-light leading-relaxed text-zinc-800 md:text-2xl">
            每回合你可输入一条不超过 20 字的行动指令。深渊 DM 将严格校验你的行动是否合法——是否符合当前持有的物品、属性、NPC 关系以及公寓规则。
          </p>
          <p className="mt-8 text-base leading-relaxed text-red-500/80">
            不可能的行动将被拒绝，并扣除理智值。不要试图欺骗系统。
          </p>
        </section>

        {/* ── Final CTA ── */}
        <section className="flex flex-col items-center py-16">
          <p className="text-sm font-light tracking-widest text-zinc-400">
            准备好了吗？
          </p>
          <Link
            href="/create"
            className="group mt-8 flex items-center gap-3 rounded-full bg-zinc-900 px-10 py-4 text-sm tracking-widest text-white transition-all duration-500 hover:bg-zinc-800 hover:shadow-2xl"
          >
            签署协议并建立档案
            <span className="inline-block transition-transform duration-300 group-hover:translate-x-1">
              →
            </span>
          </Link>
        </section>
      </div>
    </main>
  );
}
