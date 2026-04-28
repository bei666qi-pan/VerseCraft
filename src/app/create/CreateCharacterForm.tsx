"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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

const inputClass =
  "h-9 w-full border-0 border-b border-[#bdb8af] bg-transparent px-1 vc-reading-serif text-[18px] leading-none text-[#164f4d] outline-none transition placeholder:text-[17px] placeholder:text-[#365f5d]/78 focus:border-[#164f4d]";

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
    <VerseCraftPaperFrame contentClassName="pb-[calc(1rem+env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))]">
      <form
        data-testid="create-character-page"
        className="relative mx-auto flex min-h-[100dvh] w-full flex-col"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
      >
        <header className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2 text-[#164f4d]">
            <span className="text-[27px] leading-none" aria-hidden>
              ✦
            </span>
            <span className="vc-reading-serif text-[25px] font-semibold leading-none">VerseCraft</span>
          </div>

          <button
            type="button"
            data-testid="quick-create-character"
            aria-label="一键注册角色（仅生成本地角色档案，不生成账号）"
            onClick={fillQuickCharacter}
            className="absolute right-0 top-[3.55rem] inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-[#bdb8af] bg-[#f8f5ef]/90 px-3 vc-reading-serif text-[15px] font-semibold leading-none text-[#164f4d] shadow-[0_12px_24px_rgba(62,72,68,0.10),inset_0_1px_0_rgba(255,255,255,0.9)] transition hover:bg-[#fbf8f3] active:scale-[0.98]"
          >
            <VerseCraftPaperMark className="h-7 w-7 border-[#d8d3ca] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]" />
            <span className="whitespace-nowrap">一键注册角色</span>
          </button>
        </header>

        <section className="mt-[4.35rem]">
          <VerseCraftPaperSectionTitle>基础档案</VerseCraftPaperSectionTitle>
          <div className="mt-5 grid grid-cols-2 gap-x-8 gap-y-4">
            <label className="min-w-0">
              <span className="vc-reading-serif text-[18px] font-semibold leading-none text-[#164f4d]">称呼</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="请输入 2-6 字"
                className={inputClass}
              />
            </label>

            <label className="relative min-w-0">
              <span className="vc-reading-serif text-[18px] font-semibold leading-none text-[#164f4d]">性别</span>
              <select
                value={gender}
                onChange={(event) => setGender(event.target.value as GenderOption)}
                className={`${inputClass} appearance-none pr-9`}
              >
                {GENDER_OPTIONS.map((option) => (
                  <option key={option} value={option} className="bg-[#f7f3ec] text-[#164f4d]">
                    {option}
                  </option>
                ))}
              </select>
              <span
                className="pointer-events-none absolute bottom-1.5 right-1 text-[25px] leading-none text-[#164f4d]"
                aria-hidden
              >
                ⌄
              </span>
            </label>

            <label className="min-w-0">
              <span className="vc-reading-serif text-[18px] font-semibold leading-none text-[#164f4d]">身高</span>
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
                <span className="absolute bottom-2 right-0 vc-reading-serif text-[18px] leading-none text-[#164f4d]">
                  cm
                </span>
              </div>
              {heightFocused ? (
                <p className="mt-2 vc-reading-serif text-[14px] text-[#8d5854]">140 — 220</p>
              ) : null}
            </label>

            <label className="min-w-0">
              <span className="vc-reading-serif text-[18px] font-semibold leading-none text-[#164f4d]">性格</span>
              <input
                value={personality}
                onChange={(event) => setPersonality(event.target.value)}
                placeholder="2-6 个中文字符"
                className={`${inputClass} ${
                  personality.length > 0 && !personalityValid ? "border-[#8d5854] text-[#8d5854]" : ""
                }`}
              />
              {!personalityValid && personality.length > 0 ? (
                <p className="mt-2 vc-reading-serif text-[14px] text-[#8d5854]">必须为 2-6 个中文字符。</p>
              ) : null}
            </label>
          </div>
        </section>

        <VerseCraftPaperDivider className="mt-6" />

        <section className="mt-6">
          <div className="flex items-start justify-between gap-4">
            <VerseCraftPaperSectionTitle>潜能赋予</VerseCraftPaperSectionTitle>
            <div className="mt-1 flex shrink-0 items-baseline gap-4">
              <span className="vc-reading-serif text-[20px] leading-none text-[#164f4d]">剩余</span>
              <span
                data-testid="create-remaining-points"
                className={`vc-reading-serif text-[30px] font-semibold leading-none ${
                  remaining === 0 ? "text-[#164f4d]" : "text-[#274f4d]"
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

        <VerseCraftPaperDivider className="mt-4" />

        <section className="mt-5">
          <VerseCraftPaperSectionTitle>回响天赋</VerseCraftPaperSectionTitle>
          <CreateTalentGrid selectedTalent={selectedTalent} onSelectTalent={setSelectedTalent} />
        </section>

        <footer className="mt-5">
          {submitMessage ? (
            <p data-testid="create-submit-error" className="mb-3 text-center vc-reading-serif text-[16px] leading-relaxed text-[#8d5854]">
              {submitMessage}
            </p>
          ) : null}
          <VerseCraftPaperPillButton
            type="submit"
            data-testid="create-submit-button"
            disabled={!canSubmit || submitting}
            className="h-[56px] min-h-[56px] rounded-[16px] text-[28px]"
          >
            <span className="absolute left-7 text-[#c8c5bd]" aria-hidden>
              ✦
            </span>
            <span>{submitting ? "开卷中" : "开卷"}</span>
            <span className="absolute right-7 text-[#c8c5bd]" aria-hidden>
              ✦
            </span>
          </VerseCraftPaperPillButton>
        </footer>
      </form>
    </VerseCraftPaperFrame>
  );
}
