"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { StatType } from "@/lib/registry/types";
import { useGameStore, type EchoTalent } from "@/store/useGameStore";
import { GlassCtaButton } from "@/components/GlassCtaButton";

type GenderOption = "男" | "女" | "其他";

const PERSONALITY_RE = /^[\u4e00-\u9fa5]{2,6}$/;

const STAT_LABELS: Record<StatType, string> = {
  sanity: "理智",
  agility: "敏捷",
  luck: "幸运",
  charm: "魅力",
  background: "出身",
};

const STAT_DESCRIPTIONS: Record<StatType, string[]> = {
  sanity: [
    "血条，归零即死。越高越难见鬼。",
    ">20 质变：可看破隐藏道具与规则。",
  ],
  agility: [
    "跑路与闪避。越高越容易从诡异手中逃脱。",
    ">20 质变：行动有概率不消耗时间。",
  ],
  luck: [
    "欧非体质。越高越容易捡到好货。",
    ">20 质变：探索有机会直接获得 A/S 级线索。",
  ],
  charm: [
    "交涉力。越高 NPC 越友善，交易越划算。",
    ">20 质变：诡异可能短暂放过你。",
  ],
  background: [
    "1点出身对应1初始原石。",
    ">20 质变：每回合有 (20+超出点数)% 概率自动凝结 1 颗原石。",
  ],
};

const BASE_STAT = 3;
const EXTRA_POINTS = 20;

const TALENTS: readonly {
  key: EchoTalent;
  title: string;
  cd: string;
  desc: string;
}[] = [
  { key: "时间回溯", title: "时间回溯", cd: "CD：6 小时", desc: "倒流1小时，移除最后两条对话。" },
  { key: "命运馈赠", title: "命运馈赠", cd: "CD：7 小时", desc: "获得一个随机世界观相关物品。" },
  { key: "主角光环", title: "主角光环", cd: "CD：8 小时", desc: "3小时内免疫死亡，触发1次必幸事件。" },
  { key: "生命汇源", title: "生命汇源", cd: "CD：10 小时", desc: "理智恢复至历史最大值。" },
  { key: "洞察之眼", title: "洞察之眼", cd: "CD：8 小时", desc: "叙事中标出一个必定收益的选择或逃生路线。" },
  { key: "丧钟回响", title: "丧钟回响", cd: "CD：24 小时", desc: "强制处决一名恶意 NPC 或诡异（若存在）。" },
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

const GLASS_PANEL =
  "rounded-[2rem] border border-white/60 bg-white/40 shadow-[inset_0_1px_1px_rgba(255,255,255,1)] backdrop-blur-3xl";
const GLASS_INPUT =
  "rounded-xl border border-white/60 bg-white/50 px-4 text-base text-slate-800 outline-none transition-all focus:ring-2 focus:ring-indigo-400/50 focus:border-indigo-300/60 touch-manipulation min-h-[44px]";
const GLASS_BTN =
  "h-10 w-10 rounded-xl border border-white/60 bg-white/50 text-slate-700 select-none touch-manipulation transition-[transform,background-color,box-shadow] duration-150 ease-out hover:bg-white/70 hover:scale-105 hover:shadow-md active:scale-[0.92] active:bg-white/90 active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.08)] disabled:opacity-40 disabled:hover:scale-100 disabled:hover:shadow-none disabled:cursor-not-allowed disabled:active:scale-100";

export default function CreatePage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [gender, setGender] = useState<GenderOption>("男");
  const [height, setHeight] = useState<number>(170);
  const [personality, setPersonality] = useState("");
  const [heightFocused, setHeightFocused] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
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
    if (!canSubmit || !selectedTalent) {
      setSubmitAttempted(true);
      return;
    }

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
      {/* 光晕：原生径向渐变，无 filter:blur */}
      <div
        className="pointer-events-none absolute -z-10 top-[15%] right-[5%] h-[500px] w-[500px] rounded-full bg-[radial-gradient(ellipse_80%_80%_at_50%_50%,oklch(0.9_0.06_195/0.4)_0%,transparent_70%)] animate-[haloFloat_12s_ease-in-out_infinite]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -z-10 bottom-[25%] left-[5%] h-[450px] w-[450px] rounded-full bg-[radial-gradient(ellipse_80%_80%_at_50%_50%,oklch(0.88_0.08_300/0.35)_0%,transparent_70%)] animate-[haloFloat_14s_ease-in-out_infinite]"
        style={{ animationDelay: "-4s" }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -z-10 top-1/2 left-1/2 h-[350px] w-[350px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(ellipse_80%_80%_at_50%_50%,oklch(0.85_0.05_270/0.3)_0%,transparent_70%)] animate-[ambientDrift_18s_ease-in-out_infinite]"
        aria-hidden
      />

      <div className="relative z-10 mx-auto w-full max-w-3xl px-4 sm:px-6 py-4 sm:py-5">
        <section className={`relative ${GLASS_PANEL} p-8 transition-all duration-300 hover:bg-white/50 md:p-10`}>
          <h2 className="text-base font-semibold text-slate-800">基础档案</h2>

          <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">称呼</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="请输入 2-6 字"
                className={`h-11 w-full ${GLASS_INPUT}`}
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">性别</span>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value as GenderOption)}
                className={`h-11 w-full ${GLASS_INPUT}`}
              >
                <option value="男">男</option>
                <option value="女">女</option>
                <option value="其他">其他</option>
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">身高</span>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={140}
                  max={220}
                  value={height}
                  onChange={(e) => setHeight(Number(e.target.value))}
                  onFocus={() => setHeightFocused(true)}
                  onBlur={() => setHeightFocused(false)}
                  className={`h-11 w-full ${GLASS_INPUT}`}
                />
                <span className="shrink-0 text-sm text-slate-600">cm</span>
              </div>
              {heightFocused ? (
                <p className="text-xs text-red-500">140 — 220</p>
              ) : null}
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">性格</span>
              <input
                value={personality}
                onChange={(e) => setPersonality(e.target.value)}
                placeholder="仅限 2-6 个中文字符"
                className={`h-11 w-full ${GLASS_INPUT} ${
                  personality.length > 0 && !personalityValid
                    ? "border-red-400/70 focus:ring-red-400/50"
                    : ""
                }`}
              />
              {!personalityValid && personality.length > 0 ? (
                <p className="text-xs text-red-500">
                  必须为 2-6 个中文字符，深渊 DM 将严格校验。
                </p>
              ) : null}
            </label>
          </div>
        </section>

        <section className={`relative mt-8 ${GLASS_PANEL} p-8 transition-all duration-300 hover:bg-white/50 md:p-10`}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-800">属性加点</h2>
              <p className="mt-1 text-sm text-slate-600">
                可用点数 {EXTRA_POINTS}，基础值 {BASE_STAT}。必须刚好用完。
              </p>
            </div>
            <div className={`rounded-xl ${GLASS_INPUT} py-3`}>
              <div className="flex items-center justify-between gap-8">
                <span className="text-slate-600">剩余</span>
                <span className={remaining === 0 ? "font-semibold text-slate-800" : "font-semibold text-red-500"}>
                  {remaining}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {(Object.keys(STAT_LABELS) as StatType[]).map((stat) => (
              <div
                key={stat}
                className={`rounded-2xl border border-white/60 bg-white/50 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] transition-all duration-200 hover:bg-white/60`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-slate-800">{STAT_LABELS[stat]}</span>
                      <span className="text-sm text-slate-600">当前：{stats[stat]}</span>
                    </div>
                    <div className="space-y-0.5 text-sm text-slate-600 leading-relaxed">
                      {STAT_DESCRIPTIONS[stat].map((line, i) => (
                        <p key={i}>{line}</p>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => dec(stat)}
                      disabled={stats[stat] <= BASE_STAT}
                      className={GLASS_BTN}
                      aria-label={`减少${STAT_LABELS[stat]}`}
                    >
                      −
                    </button>
                    <div className="w-12 text-center text-base font-semibold text-slate-800 tabular-nums">
                      {stats[stat]}
                    </div>
                    <button
                      type="button"
                      onClick={() => inc(stat)}
                      disabled={remaining <= 0}
                      className={GLASS_BTN}
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

        <section className={`relative mt-8 ${GLASS_PANEL} p-8 transition-all duration-300 hover:bg-white/50 md:p-10`}>
          <h2 className="text-base font-semibold text-slate-800">回响天赋</h2>
          <p className="mt-1 text-sm text-slate-600">必选一项。</p>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {TALENTS.map((t) => {
              const active = selectedTalent === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setSelectedTalent(t.key)}
                  className={`rounded-2xl border p-4 text-left transition-all duration-200 ${
                    active
                      ? "border-indigo-400/70 bg-indigo-50/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]"
                      : "border-white/60 bg-white/50 hover:bg-white/60 hover:scale-[1.01] active:scale-[0.99]"
                  }`}
                  aria-pressed={active}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="text-sm font-semibold text-slate-800">{t.title}</div>
                      <div className="text-xs text-slate-500">{t.cd}</div>
                    </div>
                    <div
                      className={`mt-1 h-4 w-4 shrink-0 rounded-full border-2 transition-colors ${
                        active ? "border-indigo-500 bg-indigo-500" : "border-slate-300"
                      }`}
                      aria-hidden
                    />
                  </div>
                  <p className="mt-3 text-sm text-slate-600">{t.desc}</p>
                </button>
              );
            })}
          </div>
        </section>

        <section className="mt-8">
          <GlassCtaButton
            label="意识潜入"
            onClick={handleSubmit}
            error={
              submitAttempted && !canSubmit
                ? "检查必填项、性格格式、点数用尽、天赋已选。"
                : null
            }
          />
        </section>
      </div>
    </main>
  );
}
