"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { StatType } from "@/lib/registry/types";
import { useHeartbeat } from "@/hooks/useHeartbeat";
import { trackGameplayEvent } from "@/app/actions/telemetry";
import { validateCharacterProfile } from "@/app/actions/characterProfile";
import { useGameStore, type EchoTalent } from "@/store/useGameStore";
import { GlassCtaButton } from "@/components/GlassCtaButton";
import { GlassEntryFrame } from "@/components/GlassEntryFrame";
import type { AppPageDynamicProps } from "@/lib/next/pageDynamicProps";
import { useClientPageDynamicProps } from "@/lib/next/useClientPageDynamicProps";
import { GENDER_OPTIONS, type GenderOption } from "./constants";

const PERSONALITY_RE = /^[\u4e00-\u9fa5]{2,6}$/;

const STAT_LABELS: Record<StatType, string> = {
  sanity: "精神",
  agility: "敏捷",
  luck: "幸运",
  charm: "魅力",
  background: "出身",
};

const STAT_DESCRIPTIONS: Record<StatType, string[]> = {
  sanity: [
    "精神越稳，越能抵抗叙事侵蚀。",
    ">20 可能开启「守灯人」认证路径。",
  ],
  agility: [
    "敏捷越高，越容易在危机中找到转机。",
    ">20 可能开启「巡迹客」认证路径。",
  ],
  luck: [
    "幸运越高，越容易得到关键提示。",
    ">20 可能开启「觅兆者」认证路径。",
  ],
  charm: [
    "魅力越高，越可能改变对话走向。",
    ">20 可能开启「齐日角」认证路径。",
  ],
  background: [
    "出身会影响初始资源与灵感积累倾向。初始原石=10+出身。",
    ">20 可能开启「溯源师」认证路径。",
  ],
};

const BASE_STATS: Record<StatType, number> = {
  sanity: 10,
  agility: 0,
  luck: 0,
  charm: 0,
  background: 0,
};
const EXTRA_POINTS = 30;

const TALENTS: readonly {
  key: EchoTalent;
  title: string;
  cd: string;
  desc: string;
}[] = [
  { key: "时间回溯", title: "时间回溯", cd: "冷却：6 小时", desc: "回溯 1 小时，移除最后两条文本记录。" },
  { key: "命运馈赠", title: "命运馈赠", cd: "冷却：10 小时", desc: "在不改动底层规则的前提下，触发一次高风险的灵感夺取。" },
  { key: "主角光环", title: "主角光环", cd: "冷却：8 小时", desc: "短时间内大幅提高“叙事容错”，并触发 1 次确定性收益事件。" },
  { key: "生命汇源", title: "生命汇源", cd: "冷却：10 小时", desc: "一次最多恢复 20 点精神。" },
  { key: "洞察之眼", title: "洞察之眼", cd: "冷却：8 小时", desc: "在叙事中标记一条高确定性的推进路径。" },
  { key: "丧钟回响", title: "丧钟回响", cd: "冷却：30 小时", desc: "对当前场景中的恶意实体施加强制终止（部分存在免疫）。" },
] as const;

function baseSum(): number {
  return BASE_STATS.sanity + BASE_STATS.agility + BASE_STATS.luck + BASE_STATS.charm + BASE_STATS.background;
}

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
  "h-10 w-10 rounded-xl border border-white/60 bg-white/50 text-slate-700 select-none touch-manipulation transition-[transform,background-color,box-shadow] duration-100 ease-out hover:bg-white/70 hover:scale-105 hover:shadow-md active:scale-[0.85] active:bg-white/95 active:shadow-[inset_0_3px_6px_rgba(0,0,0,0.12)] active:border-white/80 disabled:opacity-40 disabled:hover:scale-100 disabled:hover:shadow-none disabled:cursor-not-allowed disabled:active:scale-100";

function triggerTapFeedback() {
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    navigator.vibrate(10);
  }
}

const RAPID_CLICK_WINDOW_MS = 600;
const RAPID_CLICK_THRESHOLD = 3;
const HOLD_DELAY_MS = 350;
const REPEAT_INTERVAL_MS = 120;
const ACCEL_INTERVAL_MS = 50;

function useStatStepper(
  inc: (stat: StatType) => void,
  dec: (stat: StatType) => void,
  remaining: number,
  stats: Record<StatType, number>
) {
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeatTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const clickTimes = useRef<number[]>([]);
  const isRapid = useRef(false);
  const remainingRef = useRef(remaining);
  const statsRef = useRef(stats);
  remainingRef.current = remaining;
  statsRef.current = stats;

  const clearTimers = useCallback(() => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    if (repeatTimer.current) {
      clearInterval(repeatTimer.current);
      repeatTimer.current = null;
    }
  }, []);

  const startHoldRepeat = useCallback(
    (stat: StatType, delta: 1 | -1) => {
      let stepCount = 0;
      const doStep = () => {
        const rem = remainingRef.current;
        const st = statsRef.current;
        if (delta > 0 && rem <= 0) {
          clearTimers();
          return;
        }
        if (delta < 0 && st[stat] <= BASE_STATS[stat]) {
          clearTimers();
          return;
        }
        triggerTapFeedback();
        if (delta > 0) inc(stat);
        else dec(stat);
        stepCount++;
      };
      const initialInterval = isRapid.current ? ACCEL_INTERVAL_MS : REPEAT_INTERVAL_MS;
      let intervalMs = initialInterval;
      const tick = () => {
        doStep();
        if (stepCount >= 4 && intervalMs !== ACCEL_INTERVAL_MS) {
          if (repeatTimer.current) clearInterval(repeatTimer.current);
          intervalMs = ACCEL_INTERVAL_MS;
          repeatTimer.current = setInterval(tick, intervalMs);
        }
      };
      repeatTimer.current = setInterval(tick, intervalMs);
    },
    [inc, dec, clearTimers]
  );

  const handlePointerDown = useCallback(
    (stat: StatType, delta: 1 | -1) => {
      clearTimers();
      const now = Date.now();
      clickTimes.current = clickTimes.current.filter((t) => now - t < RAPID_CLICK_WINDOW_MS);
      clickTimes.current.push(now);
      isRapid.current = clickTimes.current.length >= RAPID_CLICK_THRESHOLD;

      triggerTapFeedback();
      if (delta > 0) inc(stat);
      else dec(stat);

      holdTimer.current = setTimeout(() => {
        holdTimer.current = null;
        startHoldRepeat(stat, delta);
      }, HOLD_DELAY_MS);
    },
    [inc, dec, clearTimers, startHoldRepeat]
  );

  const handlePointerUp = useCallback(() => {
    clearTimers();
  }, [clearTimers]);

  return { handlePointerDown, handlePointerUp };
}

export default function CreatePage(props: AppPageDynamicProps) {
  useClientPageDynamicProps(props);
  const router = useRouter();
  const user = useGameStore((s) => s.user);
  const guestId = useGameStore((s) => s.guestId ?? "guest_create");
  useHeartbeat(!!user, guestId, "/create");

  const [name, setName] = useState("");
  const [gender, setGender] = useState<GenderOption>("男");
  const [height, setHeight] = useState<number>(170);
  const [personality, setPersonality] = useState("");
  const [heightFocused, setHeightFocused] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [selectedTalent, setSelectedTalent] = useState<EchoTalent | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [stats, setStats] = useState<Record<StatType, number>>({ ...BASE_STATS });

  const usedPoints = useMemo(() => sumStats(stats) - baseSum(), [stats]);
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
    const minVal = BASE_STATS[stat];
    if (stats[stat] <= minVal) return;
    setStats((s) => ({ ...s, [stat]: s[stat] - 1 }));
  }

  const stepper = useStatStepper(inc, dec, remaining, stats);

  async function handleSubmit() {
    setSubmitError(null);
    if (!canSubmit || !selectedTalent) {
      setSubmitAttempted(true);
      return;
    }

    const cleanName = name.trim();
    const cleanPersonality = personality.trim();
    const cleanHeight = clampInt(height, 140, 220);

    setSubmitting(true);
    try {
      const e2eBypass =
        process.env.NODE_ENV === "development" &&
        typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).get("e2e") === "1";
      // 说明：该分支仅用于端到端冒烟测试，避免在本地/CI 依赖外部审核与数据库链路导致不稳定。
      // 生产环境永远走 validateCharacterProfile（含安全审核）。

      const validated = e2eBypass
        ? { ok: true as const, name: cleanName, personality: cleanPersonality }
        : await validateCharacterProfile({
            name: cleanName,
            personality: cleanPersonality,
          });
      if (!validated.ok) {
        setSubmitError(validated.message);
        return;
      }

      useGameStore.getState().initCharacter(
        { name: validated.name, gender, height: cleanHeight, personality: validated.personality },
        stats,
        selectedTalent
      );
    } finally {
      setSubmitting(false);
    }

    void trackGameplayEvent({
      eventName: "create_character_success",
      sessionId: guestId,
      page: "/create",
      source: "create_page",
      idempotencyKey: `create_character_success:${guestId}:${cleanName}`,
      payload: {
        name: cleanName,
        gender,
        height: cleanHeight,
      },
    }).catch(() => {});

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
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-base font-semibold text-slate-800">基础档案</h2>
            <button
              type="button"
              aria-label="一键注册角色（仅生成本地角色档案，不生成账号）"
              onClick={() => {
                const namePool = ["黎川", "苏木", "阿夜", "行者", "白葵", "祁夜"];
                const personalityPool = ["冷静", "冲动", "多疑", "乐观", "谨慎", "偏执"];
                const pick = <T,>(arr: readonly T[]): T =>
                  arr[Math.floor(Math.random() * arr.length)] ?? arr[0]!;

                const randomName = pick(namePool);
                const randomGender: GenderOption = pick(GENDER_OPTIONS);
                const randomHeight = 160 + Math.floor(Math.random() * 41);
                const randomPersonality = pick(personalityPool);

                const base = { ...BASE_STATS };
                let remainingPoints = EXTRA_POINTS;
                const statKeys = Object.keys(BASE_STATS) as StatType[];
                while (remainingPoints > 0) {
                  const key = pick(statKeys);
                  if (base[key] >= 30) continue;
                  base[key] += 1;
                  remainingPoints -= 1;
                }

                const randomTalent = pick(TALENTS).key;

                setName(randomName);
                setGender(randomGender);
                setHeight(randomHeight);
                setPersonality(randomPersonality);
                setStats(base);
                setSelectedTalent(randomTalent);
              }}
              className="group relative inline-flex items-center gap-3 rounded-full border border-white/15 bg-slate-900/40 px-3 py-2 text-xs font-semibold text-slate-50 shadow-[0_0_30px_rgba(15,23,42,0.7)] backdrop-blur-2xl transition-all duration-300 hover:scale-105 hover:border-cyan-300/70 hover:shadow-[0_0_45px_rgba(56,189,248,0.85)] sm:px-4"
            >
              <div className="relative flex h-8 w-8 shrink-0 items-center justify-center">
                <div className="absolute -inset-1 rounded-full bg-slate-300/45 blur-md animate-pulse" />
                <div className="absolute inset-0 rounded-full border-2 border-transparent border-r-slate-300 border-t-slate-400 animate-[spin_1.2s_linear_infinite] drop-shadow-[0_0_14px_rgba(148,163,184,0.95)]" />
                <div className="relative z-[1] h-8 w-8 overflow-hidden rounded-full ring-1 ring-white/20">
                  <Image
                    src="/logo.svg"
                    alt="VerseCraft"
                    fill
                    sizes="32px"
                    draggable={false}
                    className="object-cover"
                  />
                </div>
              </div>
              <span className="relative tracking-[0.18em] sm:tracking-[0.25em]">一键注册角色</span>
            </button>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <label className="mt-4 space-y-2 sm:mt-0">
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
                {GENDER_OPTIONS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
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
                  必须为 2-6 个中文字符，主笔将严格校验。
                </p>
              ) : null}
            </label>
          </div>
        </section>

        <section className={`relative mt-8 ${GLASS_PANEL} p-8 transition-all duration-300 hover:bg-white/50 md:p-10`}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-800">叙事维度 · 潜能赋予</h2>
              <p className="mt-1 text-sm text-slate-600">
                可用点数 {EXTRA_POINTS}，精神初值 10，其余 0。必须刚好用完。初始原石=10+出身。
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
                      onPointerDown={(e) => { e.currentTarget.releasePointerCapture(e.pointerId); stepper.handlePointerDown(stat, -1); }}
                      onPointerUp={stepper.handlePointerUp}
                      onPointerLeave={stepper.handlePointerUp}
                      disabled={stats[stat] <= BASE_STATS[stat]}
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
                      onPointerDown={(e) => { e.currentTarget.releasePointerCapture(e.pointerId); stepper.handlePointerDown(stat, 1); }}
                      onPointerUp={stepper.handlePointerUp}
                      onPointerLeave={stepper.handlePointerUp}
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
          <GlassEntryFrame variant="card" className="w-full shadow-[0_14px_48px_rgba(148,163,184,0.18)]">
            <GlassCtaButton
              className="w-full"
              label="开卷"
              onClick={handleSubmit}
              disabled={submitting}
              error={
                submitError ??
                (submitAttempted && !canSubmit
                  ? "检查必填项、性格格式、点数用尽、天赋已选。"
                  : null)
              }
            />
          </GlassEntryFrame>
        </section>
      </div>
    </main>
  );
}
