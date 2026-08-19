"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { StatType } from "@/lib/registry/types";
import { useHeartbeat } from "@/hooks/useHeartbeat";
import { trackGameplayEvent } from "@/app/actions/telemetry";
import { validateCharacterProfile } from "@/app/actions/characterProfile";
import {
  VerseCraftPaperDivider,
  VerseCraftPaperFrame,
  VerseCraftPaperMark,
  VerseCraftPaperPillButton,
  VerseCraftPaperSectionTitle,
} from "@/components/VerseCraftPaperFrame";
import { useGameStore, type EchoTalent } from "@/store/useGameStore";
import { CreateStatAllocator } from "./CreateStatAllocator";
import { CreateTalentGrid } from "./CreateTalentGrid";
import {
  BASE_STATS,
  EXTRA_POINTS,
  GENDER_OPTIONS,
  TALENTS,
  calculateRemainingPoints,
  clampInt,
  isValidCreatePersonality,
  type GenderOption,
} from "./constants";
import { validateCreateProfileBeforeLocalStart } from "./createSubmitPolicy";
import { flushGameStorePersistenceDebouncedWrites } from "@/lib/idbDebouncedStorage";
import { isLikelyAndroidMobileUa } from "@/lib/platform/isLikelyAndroidMobileUa";
import { SPIRIT_ROOTS, type SpiritRoot } from "@/lib/worlds/xingni/progression";
import { XINGNI_WORLD_ID } from "@/lib/worlds/types";

const inputClass =
  "mt-2 h-11 w-full rounded-xl border border-vc-line bg-vc-paper-bright px-3.5 vc-reading-serif text-[17px] leading-none text-vc-ink outline-none transition placeholder:text-[15px] placeholder:text-vc-ink-faint focus:border-vc-ink-deep focus:shadow-[0_0_0_3px_rgba(47,116,106,0.12)]";

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] ?? arr[0]!;
}

function buildRandomStats(): Record<StatType, number> {
  const next = { ...BASE_STATS };
  const statKeys = Object.keys(BASE_STATS) as StatType[];
  let remainingPoints = EXTRA_POINTS;
  while (remainingPoints > 0) {
    const key = pick(statKeys);
    if (next[key] >= 30) continue;
    next[key] += 1;
    remainingPoints -= 1;
  }
  return next;
}

export function CreateCharacterForm({ xingniEnabled = true }: { xingniEnabled?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isXingni = searchParams.get("world") === XINGNI_WORLD_ID;
  const user = useGameStore((s) => s.user);
  const guestId = useGameStore((s) => s.guestId ?? "guest_create");
  const language = useGameStore((s) => s.language);
  const setLanguage = useGameStore((s) => s.setLanguage);
  const isEnglish = language === "en-US";
  useHeartbeat(!!user, guestId, "/create");

  // 提前预取 /play 的 RSC payload 与大体积 chunk：「开卷」不再现场拉包
  useEffect(() => {
    router.prefetch("/play");
  }, [router]);

  const [name, setName] = useState("");
  const [gender, setGender] = useState<GenderOption>("男");
  const [height, setHeight] = useState<number>(170);
  const [personality, setPersonality] = useState("");
  const [heightFocused, setHeightFocused] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [selectedTalent, setSelectedTalent] = useState<EchoTalent | null>(null);
  const [spiritRoot, setSpiritRoot] = useState<SpiritRoot>("青木");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submitInFlightRef = useRef(false);
  const [stats, setStats] = useState<Record<StatType, number>>({ ...BASE_STATS });

  const remaining = useMemo(() => calculateRemainingPoints(stats), [stats]);
  const personalityValid = isValidCreatePersonality(personality, language);

  const canSubmit =
    name.trim().length > 0 &&
    height >= 140 &&
    height <= 220 &&
    personalityValid &&
    (isXingni || remaining === 0) &&
    selectedTalent !== null;

  useEffect(() => {
    if (isXingni && selectedTalent === null) setSelectedTalent(TALENTS[0].key);
  }, [isXingni, selectedTalent]);

  const submitMessage =
    submitError ??
    (submitAttempted && !canSubmit
      ? isXingni
        ? "检查称呼、身高与性格格式，并确认星逆·太初当前可进入。"
        : isEnglish
        ? "Check your name, height, personality, allocated points, and Echo talent."
        : "检查称呼、身高、性格格式；点数必须用完，并选择一项回响天赋。"
      : null);

  function inc(stat: StatType) {
    if (remaining <= 0) return;
    setStats((s) => ({ ...s, [stat]: s[stat] + 1 }));
  }

  function dec(stat: StatType) {
    const minVal = BASE_STATS[stat];
    if (stats[stat] <= minVal) return;
    setStats((s) => ({ ...s, [stat]: s[stat] - 1 }));
  }

  function fillQuickCharacter() {
    const namePool = isEnglish ? ["Rowan", "Mira", "Ash", "Morgan", "June", "Vale"] : ["黎川", "苏木", "阿夜", "行者", "白葵", "祁夜"];
    const personalityPool = isEnglish ? ["Calm", "Impulsive", "Wary", "Optimistic", "Careful", "Obsessive"] : ["冷静", "冲动", "多疑", "乐观", "谨慎", "偏执"];

    setName(pick(namePool));
    setGender(pick(GENDER_OPTIONS));
    setHeight(160 + Math.floor(Math.random() * 41));
    setPersonality(pick(personalityPool));
    setStats(buildRandomStats());
    setSelectedTalent(pick(TALENTS).key);
    setSubmitAttempted(false);
    setSubmitError(null);
  }

  async function handleSubmit() {
    if (submitInFlightRef.current) return;
    setSubmitError(null);
    if (!xingniEnabled || !canSubmit || !selectedTalent) {
      setSubmitAttempted(true);
      return;
    }

    const cleanName = name.trim();
    const cleanPersonality = personality.trim();
    const cleanHeight = clampInt(height, 140, 220);

    submitInFlightRef.current = true;
    setSubmitting(true);
    try {
      const localSafety = validateCreateProfileBeforeLocalStart({
        name: cleanName,
        personality: cleanPersonality,
      });
      if (!localSafety.ok) {
        setSubmitError(localSafety.message);
        submitInFlightRef.current = false;
        setSubmitting(false);
        return;
      }

      useGameStore.getState().initCharacter(
        { name: cleanName, gender, height: cleanHeight, personality: cleanPersonality },
        stats,
        selectedTalent,
        { worldId: isXingni ? XINGNI_WORLD_ID : "dark_moon_prologue", spiritRoot }
      );
      try {
        useGameStore.getState().saveGame(useGameStore.getState().currentSaveSlot);
      } catch (saveError) {
        console.warn("[create] main_slot save failed before play navigation", saveError);
      }

      await flushGameStorePersistenceDebouncedWrites();

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
          worldId: isXingni ? XINGNI_WORLD_ID : "dark_moon_prologue",
          ...(isXingni ? { spiritRoot } : {}),
        },
      }).catch(() => {});
      void validateCharacterProfile({
        name: cleanName,
        personality: cleanPersonality,
      }).then((validated) => {
        if (!validated.ok) {
          console.warn("[create] post-start profile moderation rejected after local start", {
            message: validated.message,
          });
        }
      }).catch((moderationError) => {
        console.warn("[create] post-start profile moderation skipped", moderationError);
      });

      const android = isLikelyAndroidMobileUa();
      if (typeof window !== "undefined" && android) {
        window.location.assign("/play");
        return;
      }

      router.replace("/play");
      if (typeof window !== "undefined") {
        window.setTimeout(() => {
          if (window.location.pathname.includes("/create")) {
            submitInFlightRef.current = false;
            setSubmitting(false);
            window.location.assign("/play");
          }
        }, 2200);
      }
    } catch (error) {
      console.error("[create] failed to initialize character", error);
      submitInFlightRef.current = false;
      setSubmitError(isEnglish ? "Your local character profile was not saved. Check browser storage permission and try again." : "本地角色档案没有写入，请检查浏览器存储权限后再次开卷。");
      setSubmitting(false);
    }
  }

  return (
    <VerseCraftPaperFrame
      maxWidthClassName="max-w-[470px] lg:max-w-[640px]" contentClassName="pb-[calc(1rem+env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))]">
      <form
        data-testid="create-character-page"
        className="relative mx-auto flex min-h-[calc(var(--vc-vh,1svh)_*_100)] w-full flex-col overflow-x-hidden"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
      >
        <header className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5 text-vc-ink">
            <VerseCraftPaperMark className="h-9 w-9 border-vc-line shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]" />
            <span className="vc-reading-serif text-[20px] font-semibold leading-none">VerseCraft</span>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              data-testid="create-language-toggle"
              aria-label={isEnglish ? "Switch to Simplified Chinese" : "Switch to English"}
              onClick={() => setLanguage(isEnglish ? "zh-CN" : "en-US")}
              className="h-10 rounded-full border border-vc-line bg-vc-paper-raised/90 px-3 vc-reading-serif text-[14px] font-semibold leading-none text-vc-ink vc-shadow-card transition hover:bg-vc-paper-bright active:scale-[0.97]"
            >
              {isEnglish ? "中文" : "EN"}
            </button>
            <button
              type="button"
              data-testid="quick-create-character"
              aria-label={isEnglish ? "Create a local character with random values" : "一键注册角色（仅生成本地角色档案，不生成账号）"}
              onClick={fillQuickCharacter}
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-vc-line bg-vc-paper-raised/90 py-1 pl-1.5 pr-4 vc-reading-serif text-[14px] font-semibold leading-none text-vc-ink vc-shadow-card transition hover:bg-vc-paper-bright active:scale-[0.97]"
            >
              <VerseCraftPaperMark className="h-7 w-7 border-vc-line shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]" />
              <span className="whitespace-nowrap">{isEnglish ? "Quick start" : "一键注册"}</span>
            </button>
          </div>
        </header>

        <section className="mt-8 animate-fade-in-up">
          <p className="vc-reading-serif text-[12px] font-semibold uppercase tracking-[0.34em] text-vc-ink-faint">
            {isXingni ? "星逆 · 太初 / 青石县" : (isEnglish ? "PROLOGUE · DARK MOON" : "序章 · 暗月")}
          </p>
          <h1 className="mt-2.5 vc-reading-serif text-[32px] font-semibold leading-tight text-vc-ink-deep">{isEnglish ? "Before you enter" : "入卷之前"}</h1>
          <p className="mt-2 vc-reading-serif text-[15px] leading-relaxed text-vc-ink-soft">
            {isXingni ? "写下这名落魄散修的轮廓。气海虽损，仙途未绝。" : (isEnglish ? "Give this body a shape. Under the Dark Moon, the apartment remembers every name that enters." : "写下这具身体的轮廓。暗月之下，公寓会记住每一个走进来的名字。")}
          </p>
          <VerseCraftPaperDivider className="mt-5 w-[11rem]" />
        </section>

        {isXingni ? (
          <section className="vc-card mt-5 px-5 py-5" data-testid="create-spirit-root-selector">
            <VerseCraftPaperSectionTitle>灵根方向</VerseCraftPaperSectionTitle>
            <p className="mt-2 text-[14px] leading-6 text-vc-ink-soft">灵根决定首版修炼倾向；角色固定从气海受损的炼气二层开始。</p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {SPIRIT_ROOTS.map((root) => (
                <button
                  key={root}
                  type="button"
                  data-testid={`create-spirit-root-${root}`}
                  aria-pressed={spiritRoot === root}
                  onClick={() => setSpiritRoot(root)}
                  className={`rounded-xl border px-3 py-3 vc-reading-serif text-[17px] font-semibold transition ${spiritRoot === root ? "border-vc-accent bg-vc-accent text-white" : "border-vc-line bg-vc-paper-bright text-vc-ink"}`}
                >
                  {root}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {isXingni && !xingniEnabled ? (
          <section
            className="mt-5 rounded-2xl border border-vc-seal/35 bg-vc-seal/5 px-5 py-4 text-vc-seal"
            data-testid="create-world-disabled"
            role="status"
          >
            <p className="vc-reading-serif text-[17px] font-semibold">星逆·太初暂不可进入</p>
            <p className="mt-1 text-[14px] leading-6">已有玄幻存档会完整保留，世界重新开放后可继续游玩。</p>
          </section>
        ) : null}

        <section className="vc-card mt-6 px-5 py-5">
          <VerseCraftPaperSectionTitle>{isEnglish ? "Profile" : "基础档案"}</VerseCraftPaperSectionTitle>
          <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4">
            <label className="min-w-0">
              <span className="vc-reading-serif text-[18px] font-semibold leading-none text-vc-ink">{isEnglish ? "Name" : "称呼"}</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={isEnglish ? "Enter a name" : "请输入 2-6 字"}
                className={inputClass}
              />
            </label>

            <label className="relative min-w-0">
              <span className="vc-reading-serif text-[18px] font-semibold leading-none text-vc-ink">{isEnglish ? "Gender" : "性别"}</span>
              <select
                value={gender}
                onChange={(event) => setGender(event.target.value as GenderOption)}
                className={`${inputClass} appearance-none pr-9`}
              >
                {GENDER_OPTIONS.map((option) => (
                  <option key={option} value={option} className="bg-vc-paper text-vc-ink">
                    {isEnglish ? ({ 男: "Male", 女: "Female", 其他: "Other" }[option]) : option}
                  </option>
                ))}
              </select>
              <span
                className="pointer-events-none absolute bottom-2 right-3 text-[22px] leading-none text-vc-ink"
                aria-hidden
              >
                ⌄
              </span>
            </label>

            <label className="min-w-0">
              <span className="vc-reading-serif text-[18px] font-semibold leading-none text-vc-ink">{isEnglish ? "Height" : "身高"}</span>
              <div className="relative">
                <input
                  type="number"
                  min={140}
                  max={220}
                  value={height}
                  onChange={(event) => setHeight(Number(event.target.value))}
                  onFocus={() => setHeightFocused(true)}
                  onBlur={() => setHeightFocused(false)}
                  className={`${inputClass} pr-11 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
                />
                <span className="absolute bottom-2.5 right-3 vc-reading-serif text-[16px] leading-none text-vc-ink-soft">
                  cm
                </span>
              </div>
              {heightFocused ? (
                <p className="mt-2 vc-reading-serif text-[14px] text-vc-seal">140 — 220</p>
              ) : null}
            </label>

            <label className="min-w-0">
              <span className="vc-reading-serif text-[18px] font-semibold leading-none text-vc-ink">{isEnglish ? "Personality" : "性格"}</span>
              <input
                value={personality}
                onChange={(event) => setPersonality(event.target.value)}
                placeholder={isEnglish ? "2–24 English characters" : "2-6 个中文字符"}
                className={`${inputClass} ${
                  personality.length > 0 && !personalityValid ? "border-vc-seal text-vc-seal" : ""
                }`}
              />
              {!personalityValid && personality.length > 0 ? (
                <p className="mt-2 vc-reading-serif text-[14px] text-vc-seal">{isEnglish ? "Use 2–24 English letters, spaces, apostrophes, or hyphens." : "必须为 2-6 个中文字符。"}</p>
              ) : null}
            </label>
          </div>
        </section>

        {!isXingni ? <section className="vc-card mt-5 px-5 py-5">
          <div className="flex items-start justify-between gap-4">
            <VerseCraftPaperSectionTitle>{isEnglish ? "Attributes" : "潜能赋予"}</VerseCraftPaperSectionTitle>
            <div className="mt-0.5 flex shrink-0 items-center gap-2 rounded-full border border-vc-line bg-vc-paper-bright px-3 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]">
              <span className="vc-reading-serif text-[13px] leading-none text-vc-ink-soft">{isEnglish ? "Left" : "剩余"}</span>
              <span
                data-testid="create-remaining-points"
                className={`vc-reading-serif text-[22px] font-semibold leading-none transition-colors ${
                  remaining === 0 ? "text-vc-ink" : "text-vc-accent"
                }`}
              >
                {remaining}
              </span>
            </div>
          </div>
          <CreateStatAllocator
            stats={stats}
            remaining={remaining}
            onIncrement={inc}
            onDecrement={dec}
          />
        </section> : null}

        {!isXingni ? <section className="vc-card mt-5 px-5 py-5">
          <VerseCraftPaperSectionTitle>{isEnglish ? "Echo talent" : "回响天赋"}</VerseCraftPaperSectionTitle>
          <CreateTalentGrid selectedTalent={selectedTalent} onSelectTalent={setSelectedTalent} />
        </section> : null}

        <footer className="mt-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {submitMessage ? (
            <p data-testid="create-submit-error" className="mb-3 text-center vc-reading-serif text-[16px] leading-relaxed text-vc-seal">
              {submitMessage}
            </p>
          ) : null}
          <VerseCraftPaperPillButton
            type="submit"
            tone="ink"
            data-testid="create-submit-button"
            disabled={!xingniEnabled || !canSubmit || submitting}
            className="h-[54px] min-h-[54px] touch-manipulation rounded-2xl text-[20px]"
          >
            <span className="absolute left-6 text-vc-paper-bright/50" aria-hidden>
              ✦
            </span>
            <span>{submitting ? (isEnglish ? "Entering…" : "开卷中") : (isEnglish ? "Enter the story" : "开卷")}</span>
            <span className="absolute right-6 text-vc-paper-bright/50" aria-hidden>
              ✦
            </span>
          </VerseCraftPaperPillButton>
        </footer>
      </form>
    </VerseCraftPaperFrame>
  );
}
