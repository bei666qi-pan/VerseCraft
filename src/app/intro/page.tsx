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

export default function IntroPage() {
  return (
    <main className="flex flex-1 flex-col items-center px-6 py-16">
      <article className="w-full max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          入职协议与世界观须知
        </h1>
        <p className="mt-3 text-sm text-foreground/50">
          请在签署前仔细阅读以下内容。签署即视为同意所有条款。
        </p>

        <div className="mt-10 space-y-8">
          <section>
            <h2 className="text-lg font-semibold">§1 关于「如月公寓」的真相</h2>
            <div className="mt-3 rounded-2xl border border-border bg-muted/50 px-6 py-5 text-sm leading-relaxed text-foreground/80">
              <p>
                如月公寓并非人类建筑。它是某种高维生物的
                <strong className="text-foreground">拟态消化器官</strong>。
              </p>
              <p className="mt-3">
                你所看见的承重墙，是骨骼在三维空间的投影；走廊尽头永远滴落的红色液体，
                不是水管泄漏——那是胃酸。每一层楼都是一段蠕动的肠壁，
                而你正沿着它的消化方向行走。
              </p>
              <p className="mt-3">
                公寓会发布规则。规则是这具身体的免疫协议。
                <strong className="text-danger">
                  违反规则等同于被抗体标记，你将被大模型 DM 直接抹杀。
                </strong>
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold">§2 核心属性系统</h2>
            <p className="mt-2 text-sm text-foreground/60">
              创建角色时，你将分配 20 个属性点到以下 5 项基础属性中。
            </p>
            <div className="mt-4 space-y-3">
              {STATS.map((stat) => (
                <div
                  key={stat.name}
                  className="flex items-start gap-4 rounded-xl border border-border px-5 py-4"
                >
                  <span className="shrink-0 text-base font-semibold">
                    {stat.name}
                  </span>
                  <p className="text-sm leading-relaxed text-foreground/60">
                    {stat.desc}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold">§3 回响天赋</h2>
            <div className="mt-3 rounded-2xl border border-border bg-muted/50 px-6 py-5 text-sm leading-relaxed text-foreground/80">
              <p>
                每位入住者可选择一项
                <strong className="text-foreground">回响天赋（Echo Talent）</strong>。
                天赋是你对抗规则与异常的核心手段，但每次使用后将进入冷却。
              </p>
              <p className="mt-3">
                可选天赋包括：时间回溯、命运馈赠、主角光环、生命汇源、洞察之眼、丧钟回响。
                每项天赋拥有不同的冷却回合数与触发效果。合理规划天赋使用节奏，
                是存活的关键。
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold">§4 行动守则</h2>
            <div className="mt-3 rounded-2xl border border-border bg-muted/50 px-6 py-5 text-sm leading-relaxed text-foreground/80">
              <p>
                每回合你可输入一条不超过 20 字的行动指令。深渊 DM（大模型）将严格校验
                你的行动是否合法——是否符合当前持有的物品、属性、NPC
                关系以及公寓规则。
              </p>
              <p className="mt-3 text-danger font-medium">
                不可能的行动将被拒绝，并扣除理智值。不要试图欺骗系统。
              </p>
            </div>
          </section>
        </div>

        <div className="mt-12 flex justify-center">
          <Link
            href="/create"
            className="inline-flex items-center gap-2 rounded-full bg-foreground px-8 py-3.5 text-sm font-medium text-background transition-all hover:opacity-80 active:scale-[0.97]"
          >
            签署协议并建立档案
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </article>
    </main>
  );
}
