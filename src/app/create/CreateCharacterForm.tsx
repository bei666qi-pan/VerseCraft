"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { StatType } from "@/lib/registry/types";
import { useHeartbeat } from "@/hooks/useHeartbeat";
import { trackGameplayEvent } from "@/app/actions/telemetry";
import { validateCharacterProfile } from "@/app/actions/characterProfile";
import { VerseCraftDarkPageFrame } from "@/components/VerseCraftDarkPageFrame";
import { VerseCraftOrnament, VerseCraftSectionTitle } from "@/components/VerseCraftOrnament";
import { MobileReadingIcons } from "@/features/play/mobileReading/icons";
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

const inputClass =
  "h-12 w-full border-0 border-b border-[#c46d3d]/90 bg-transparent px-1 vc-reading-serif text-[22px] leading-none text-[#f0a061] outline-none transition placeholder:text-[#dc8c50]/90 focus:border-[#ffb767] focus:text-[#ffb767]";

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

export function CreateCharacterForm() {
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

  const remaining = useMemo(() => calculateRemainingPoints(stats), [stats]);
  const personalityValid = isValidCreatePersonality(personality);

  const canSubmit =
    name.trim().length > 0 &&
    height >= 140 &&
    height <= 220 &&
    personalityValid &&
    remaining === 0 &&
    selectedTalent !== null;

  const submitMessage =
    submitError ??
    (submitAttempted && !canSubmit
      ? "检查称呼、身高、性格格式；点数必须用完，并选择一项回响天赋。"
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
    const namePool = ["黎川", "苏木", "阿夜", "行者", "白葵", "祁夜"];
    const personalityPool = ["冷静", "冲动", "多疑", "乐观", "谨慎", "偏执"];

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
      // 该分支仅用于端到端冒烟测试，避免本地/CI 依赖外部审核与数据库链路导致不稳定。
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
    <VerseCraftDarkPageFrame contentClassName="pb-[calc(1.2rem+env(safe-area-inset-bottom))] pt-[max(1.3rem,env(safe-area-inset-top))]">
      <form
        data-testid="create-character-page"
        className="mx-auto flex min-h-[100dvh] w-full flex-col"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
      >
        <header className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2 text-[#ff9d54]">
            <span className="vc-reading-serif text-[30px] font-semibold leading-none drop-shadow-[0_0_12px_rgba(255,132,62,0.24)]">
              VerseCraft
            </span>
            <MobileReadingIcons.BrandMark className="mt-1 h-6 w-6 shrink-0" strokeWidth={1.45} />
          </div>

          <button
            type="button"
            data-testid="quick-create-character"
            aria-label="一键注册角色（仅生成本地角色档案，不生成账号）"
            onClick={fillQuickCharacter}
            className="mt-14 inline-flex h-12 shrink-0 items-center gap-2 rounded-full border border-[#de7a3e]/95 bg-[#06131d]/56 px-3.5 vc-reading-serif text-[18px] font-semibold leading-none text-[#ffb767] shadow-[0_0_16px_rgba(226,106,49,0.12),inset_0_0_12px_rgba(226,106,49,0.06)] transition hover:bg-[#0c1c28] active:scale-[0.98]"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[#8a5538]/90 bg-[#121923] text-[13px] text-[#f6c17f]">
              ◆
            </span>
            <span className="whitespace-nowrap">一键注册角色</span>
          </button>
        </header>

        <section className="mt-10">
          <VerseCraftSectionTitle>基础档案</VerseCraftSectionTitle>
          <div className="mt-7 grid grid-cols-2 gap-x-8 gap-y-7">
            <label className="min-w-0">
              <span className="vc-reading-serif text-[20px] font-semibold leading-none text-[#e38d4f]">称呼</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="请输入 2-6 字"
                className={inputClass}
              />
            </label>

            <label className="relative min-w-0">
              <span className="vc-reading-serif text-[20px] font-semibold leading-none text-[#e38d4f]">性别</span>
              <select
                value={gender}
                onChange={(event) => setGender(event.target.value as GenderOption)}
                className={`${inputClass} appearance-none pr-9`}
              >
                {GENDER_OPTIONS.map((option) => (
                  <option key={option} value={option} className="bg-[#08131d] text-[#ffb767]">
                    {option}
                  </option>
                ))}
              </select>
              <span
                className="pointer-events-none absolute bottom-3 right-1 text-[30px] leading-none text-[#ff9d54]"
                aria-hidden
              >
                ⌄
              </span>
            </label>

            <label className="min-w-0">
              <span className="vc-reading-serif text-[20px] font-semibold leading-none text-[#e38d4f]">身高</span>
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
                <span className="absolute bottom-3 right-0 vc-reading-serif text-[22px] leading-none text-[#f0a061]">
                  cm
                </span>
              </div>
              {heightFocused ? (
                <p className="mt-2 vc-reading-serif text-[14px] text-[#e05f52]">140 — 220</p>
              ) : null}
            </label>

            <label className="min-w-0">
              <span className="vc-reading-serif text-[20px] font-semibold leading-none text-[#e38d4f]">性格</span>
              <input
                value={personality}
                onChange={(event) => setPersonality(event.target.value)}
                placeholder="仅限 2-6 个中文字符"
                className={`${inputClass} ${
                  personality.length > 0 && !personalityValid ? "border-[#df5650] text-[#ff8b78]" : ""
                }`}
              />
              {!personalityValid && personality.length > 0 ? (
                <p className="mt-2 vc-reading-serif text-[14px] text-[#e05f52]">必须为 2-6 个中文字符。</p>
              ) : null}
            </label>
          </div>
        </section>

        <VerseCraftOrnament className="mt-10" />

        <section className="mt-9">
          <div className="flex items-start justify-between gap-4">
            <VerseCraftSectionTitle>潜能赋予</VerseCraftSectionTitle>
            <div className="mt-1 flex shrink-0 items-baseline gap-4">
              <span className="vc-reading-serif text-[22px] leading-none text-[#ffb767]">剩余</span>
              <span
                data-testid="create-remaining-points"
                className={`vc-reading-serif text-[35px] font-semibold leading-none ${
                  remaining === 0 ? "text-[#ffb767]" : "text-[#ff4747]"
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
        </section>

        <VerseCraftOrnament className="mt-7" />

        <section className="mt-8">
          <VerseCraftSectionTitle>回响天赋</VerseCraftSectionTitle>
          <CreateTalentGrid selectedTalent={selectedTalent} onSelectTalent={setSelectedTalent} />
        </section>

        <footer className="mt-8">
          {submitMessage ? (
            <p data-testid="create-submit-error" className="mb-3 text-center vc-reading-serif text-[16px] leading-relaxed text-[#ff7468]">
              {submitMessage}
            </p>
          ) : null}
            <button
              type="submit"
              data-testid="create-submit-button"
              disabled={!canSubmit || submitting}
            className={`relative flex h-[64px] w-full items-center justify-center overflow-hidden rounded-[16px] border vc-reading-serif text-[35px] font-semibold leading-none transition active:scale-[0.99] ${
              canSubmit
                ? "border-[#f0ad64]/95 bg-[#3a2113]/82 text-[#ffd18d] shadow-[0_0_24px_rgba(235,128,54,0.26),inset_0_0_28px_rgba(255,172,84,0.13)]"
                : "border-[#8e5639]/80 bg-[#1d1714]/72 text-[#b9784c] shadow-[inset_0_0_20px_rgba(190,106,54,0.06)]"
            } disabled:cursor-not-allowed disabled:opacity-70`}
          >
            <span className="pointer-events-none absolute inset-x-10 bottom-0 h-5 bg-[#f28c38]/35 blur-xl" aria-hidden />
            <span className="relative z-10">{submitting ? "开卷中" : "开卷"}</span>
          </button>
        </footer>
      </form>
    </VerseCraftDarkPageFrame>
  );
}
