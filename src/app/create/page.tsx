"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { StatType } from "@/lib/registry/types";
import { useGameStore, type EchoTalent } from "@/store/useGameStore";

type GenderOption = "男" | "女" | "其他";

const PERSONALITY_RE = /^[\u4e00-\u9fa5]{2,6}$/;

const STAT_LABELS: Record<StatType, string> = {
  sanity: "理智",
  agility: "敏捷",
  luck: "幸运",
  charm: "魅力",
  background: "出身",
};

const STAT_DESCRIPTIONS: Record<StatType, string> = {
  sanity:
    "你的血条。归零即死。越高越不容易见鬼。>20 质变：能直接看破隐藏道具和规则。",
  agility:
    "跑路和闪避速度。越高越容易从诡异手里逃脱。>20 质变：天下武功唯快不破，行动有概率不消耗时间。",
  luck:
    "非酋还是欧皇。越高出门越容易捡到宝。>20 质变：走路都能踢到 A 级甚至 S 级神器。",
  charm:
    "靠脸吃饭的交涉力。越高 NPC 越喜欢你。>20 质变：诡异看了你都得愣一秒放你一条生路。",
  background:
    "投胎技术。决定你的开局富裕程度。>20 质变：开局自带满级大佬 NPC 当保镖。",
};

const BASE_STAT = 3;
const EXTRA_POINTS = 20;

const TALENTS: readonly {
  key: EchoTalent;
  title: string;
  cd: string;
  desc: string;
}[] = [
  { key: "时间回溯", title: "时间回溯", cd: "CD：6 小时", desc: "时间倒流1小时，移除最后两条对话记录。" },
  { key: "命运馈赠", title: "命运馈赠", cd: "CD：3 小时", desc: "获得一个随机世界观相关物品。" },
  { key: "主角光环", title: "主角光环", cd: "CD：6 小时", desc: "3小时内免疫死亡，触发1次必定幸运事件。" },
  { key: "生命汇源", title: "生命汇源", cd: "CD：7 小时", desc: "将理智恢复至你曾达到过的历史最大值。" },
  { key: "洞察之眼", title: "洞察之眼", cd: "CD：4 小时", desc: "叙事中标记一个必定收益的选择或逃生路线。" },
  { key: "丧钟回响", title: "丧钟回响", cd: "CD：7 小时", desc: "强制处决一名恶意NPC或诡异（若存在）。" },
] as const;

function sumStats(stats: Record<StatType, number>): number {
  return (
    stats.sanity + stats.agility + stats.luck + stats.charm + stats.background
  );
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

export default function CreatePage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [gender, setGender] = useState<GenderOption>("男");
  const [height, setHeight] = useState<number>(170);
  const [personality, setPersonality] = useState("");
  const [selectedTalent, setSelectedTalent] = useState<EchoTalent | null>(null);

  const [stats, setStats] = useState<Record<StatType, number>>({
    sanity: BASE_STAT,
    agility: BASE_STAT,
    luck: BASE_STAT,
    charm: BASE_STAT,
    background: BASE_STAT,
  });

  const usedPoints = useMemo(() => sumStats(stats) - BASE_STAT * 5, [stats]);
  const remaining = EXTRA_POINTS - usedPoints;

  const personalityValid = PERSONALITY_RE.test(personality);

  const canSubmit =
    name.trim().length > 0 &&
    height >= 140 &&
    height <= 220 &&
    personalityValid &&
    remaining === 0 &&
    selectedTalent !== null;

  function inc(stat: StatType) {
    if (remaining <= 0) return;
    setStats((s) => ({ ...s, [stat]: s[stat] + 1 }));
  }

  function dec(stat: StatType) {
    if (stats[stat] <= BASE_STAT) return;
    setStats((s) => ({ ...s, [stat]: s[stat] - 1 }));
  }

  function handleSubmit() {
    if (!canSubmit || !selectedTalent) return;

    const cleanName = name.trim();
    const cleanPersonality = personality.trim();
    const cleanHeight = clampInt(height, 140, 220);

    useGameStore.getState().initCharacter(
      { name: cleanName, gender, height: cleanHeight, personality: cleanPersonality },
      stats,
      selectedTalent
    );

    router.push("/play");
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-50 text-slate-800">
      {/* 环境漫反射光晕 */}
      <div className="pointer-events-none absolute -z-10 top-0 left-1/2 h-[500px] w-[80vw] -translate-x-1/2 rounded-full bg-indigo-100/40 blur-[120px]" />
      <div className="pointer-events-none absolute -z-10 bottom-0 right-1/4 h-[400px] w-[40vw] rounded-full bg-purple-50/50 blur-[100px]" />

      <div className="relative z-10 mx-auto w-full max-w-3xl px-6 py-12">
        <header className="space-y-3">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">铸造角色</h1>
          <p className="text-sm text-slate-600">
            你正在向如月公寓递交一份自我证明。每一个字，都将被记录。
          </p>
        </header>

        <section className="relative mt-10 rounded-[2rem] border border-white bg-white/60 p-8 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.05)] backdrop-blur-2xl transition-all hover:bg-white/70 md:p-10">
          <h2 className="text-base font-semibold text-slate-900">基础档案</h2>

          <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">称呼（Name）</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="请输入你的称呼"
                className="h-11 w-full rounded-xl border border-white/80 bg-white/50 px-4 text-sm text-slate-800 outline-none transition-all focus:ring-2 focus:ring-indigo-400/50"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">性别（Gender）</span>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value as GenderOption)}
                className="h-11 w-full rounded-xl border border-white/80 bg-white/50 px-4 text-sm text-slate-800 outline-none transition-all focus:ring-2 focus:ring-indigo-400/50"
              >
                <option value="男">男</option>
                <option value="女">女</option>
                <option value="其他">其他</option>
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">身高（Height）</span>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={140}
                  max={220}
                  value={height}
                  onChange={(e) => setHeight(Number(e.target.value))}
                  className="h-11 w-full rounded-xl border border-white/80 bg-white/50 px-4 text-sm text-slate-800 outline-none transition-all focus:ring-2 focus:ring-indigo-400/50"
                />
                <span className="shrink-0 text-sm text-neutral-600">cm</span>
              </div>
              <p className="text-xs text-neutral-500">范围：140 - 220</p>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">性格（Personality）</span>
              <input
                value={personality}
                onChange={(e) => setPersonality(e.target.value)}
                placeholder="仅限 2-6 个中文字符"
                className={`h-11 w-full rounded-xl border bg-white/50 px-4 text-sm text-slate-800 outline-none transition-all focus:ring-2 focus:ring-indigo-400/50 ${
                  personality.length === 0
                    ? "border-white/80"
                    : personalityValid
                      ? "border-white/80"
                      : "border-red-400 focus:ring-red-400/50"
                }`}
              />
              <p className="text-xs text-danger">
                注意：深渊 DM 将严格校验性格设定。若输入非法词汇、玩梗或毫无关联的乱码，将在序章被诡异直接抹杀！
              </p>
              {!personalityValid && personality.length > 0 ? (
                <p className="text-xs text-danger">
                  当前输入不合法：必须匹配{" "}
                  <span className="font-mono">
                    {String.raw`^[\u4e00-\u9fa5]{2,6}$`}
                  </span>
                  。
                </p>
              ) : null}
            </label>
          </div>
        </section>

        <section className="relative mt-8 rounded-[2rem] border border-white bg-white/60 p-8 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.05)] backdrop-blur-2xl transition-all hover:bg-white/70 md:p-10">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">属性加点（RPG System）</h2>
              <p className="mt-1 text-sm text-slate-600">
                总可用点数 {EXTRA_POINTS}，基础值均为 {BASE_STAT}。必须刚好用完。
              </p>
            </div>
            <div className="rounded-xl border border-white/80 bg-white/50 px-4 py-3 text-sm text-slate-800">
              <div className="flex items-center justify-between gap-8">
                <span className="text-neutral-600">剩余点数</span>
                <span className={remaining === 0 ? "font-semibold" : "font-semibold text-danger"}>
                  {remaining}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {(Object.keys(STAT_LABELS) as StatType[]).map((stat) => (
              <div
                key={stat}
                className="rounded-2xl border border-white/80 bg-white/50 p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold">{STAT_LABELS[stat]}</span>
                      <span className="text-sm text-neutral-600">
                        当前：{stats[stat]}
                      </span>
                    </div>
                    <p className="text-sm text-neutral-600">
                      {STAT_DESCRIPTIONS[stat]}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => dec(stat)}
                      disabled={stats[stat] <= BASE_STAT}
                      className="h-10 w-10 rounded-xl border border-white/80 bg-white/70 text-lg text-slate-700 transition disabled:opacity-40"
                      aria-label={`减少${STAT_LABELS[stat]}`}
                    >
                      -
                    </button>
                    <div className="w-10 text-center text-sm font-semibold">
                      {stats[stat]}
                    </div>
                    <button
                      type="button"
                      onClick={() => inc(stat)}
                      disabled={remaining <= 0}
                      className="h-10 w-10 rounded-xl border border-white/80 bg-white/70 text-lg text-slate-700 transition disabled:opacity-40"
                      aria-label={`增加${STAT_LABELS[stat]}`}
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="relative mt-8 rounded-[2rem] border border-white bg-white/60 p-8 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.05)] backdrop-blur-2xl transition-all hover:bg-white/70 md:p-10">
          <h2 className="text-base font-semibold text-slate-900">回响天赋（Echo Talents）</h2>
          <p className="mt-1 text-sm text-slate-600">必须单选 1 个。</p>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {TALENTS.map((t) => {
              const active = selectedTalent === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setSelectedTalent(t.key)}
                  className={`rounded-2xl border p-4 text-left transition ${
                    active
                      ? "border-indigo-400/60 bg-indigo-50/80"
                      : "border-white/80 bg-white/50 hover:bg-white/70"
                  }`}
                  aria-pressed={active}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="text-sm font-semibold">{t.title}</div>
                      <div className="text-xs text-neutral-600">{t.cd}</div>
                    </div>
                    <div
                      className={`mt-1 h-4 w-4 rounded-full border ${
                        active ? "border-indigo-500 bg-indigo-500" : "border-slate-300"
                      }`}
                      aria-hidden
                    />
                  </div>
                  <p className="mt-3 text-sm text-neutral-700">{t.desc}</p>
                </button>
              );
            })}
          </div>
        </section>

        <section className="mt-8">
          <div className="relative rounded-[2rem] border border-white bg-white/60 p-8 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.05)] backdrop-blur-2xl transition-all hover:bg-white/70 md:p-10">
            <h2 className="text-base font-semibold text-slate-900">确认提交</h2>
            <p className="mt-2 text-sm text-slate-600">
              你将带着这份设定进入意识潜入区。一旦落笔，规则将开始回收你。
            </p>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-slate-600">
                {!canSubmit ? (
                  <span className="text-red-600">
                    未满足提交条件：请检查必填字段、性格格式、点数是否用尽、天赋是否已选择。
                  </span>
                ) : (
                  <span>校验通过。准备进入。</span>
                )}
              </div>

              <div className="group relative inline-flex items-center justify-center">
                <div className="absolute inset-0 rounded-full bg-indigo-500/20 blur-xl transition-all duration-500 group-hover:bg-indigo-500/30 group-hover:blur-2xl" />
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  className="relative rounded-full border border-white/80 bg-white/90 px-10 py-3.5 text-sm font-bold tracking-widest text-slate-800 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-md transition-all disabled:opacity-40 hover:scale-[1.02]"
                >
                  进入意识潜入
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
