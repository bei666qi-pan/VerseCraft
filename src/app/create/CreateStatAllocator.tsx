"use client";

import { useCallback, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { StatType } from "@/lib/registry/types";
import {
  BASE_STATS,
  CREATE_STAT_ORDER,
  STAT_DESCRIPTIONS,
  STAT_LABELS,
} from "./constants";

const RAPID_CLICK_WINDOW_MS = 600;
const RAPID_CLICK_THRESHOLD = 3;
const HOLD_DELAY_MS = 350;
const REPEAT_INTERVAL_MS = 120;
const ACCEL_INTERVAL_MS = 50;

function triggerTapFeedback() {
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    navigator.vibrate(10);
  }
}

function releasePointerCapture(event: ReactPointerEvent<HTMLButtonElement>) {
  try {
    event.currentTarget.releasePointerCapture(event.pointerId);
  } catch {
    // Some browsers do not set capture for this interaction.
  }
}

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
      let intervalMs = isRapid.current ? ACCEL_INTERVAL_MS : REPEAT_INTERVAL_MS;
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
    [clearTimers, dec, inc]
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
    [clearTimers, dec, inc, startHoldRepeat]
  );

  return {
    handlePointerDown,
    handlePointerUp: clearTimers,
  };
}

const stepButtonClass =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#d46f35]/95 bg-[#06141f]/38 vc-reading-serif text-[27px] leading-none text-[#ff9c4d] shadow-[0_0_12px_rgba(225,105,45,0.12),inset_0_0_10px_rgba(225,105,45,0.05)] transition enabled:hover:bg-[#111e27] enabled:active:scale-90 disabled:cursor-not-allowed disabled:opacity-35";

export function CreateStatAllocator({
  onDecrement,
  onIncrement,
  remaining,
  stats,
}: {
  onDecrement: (stat: StatType) => void;
  onIncrement: (stat: StatType) => void;
  remaining: number;
  stats: Record<StatType, number>;
}) {
  const stepper = useStatStepper(onIncrement, onDecrement, remaining, stats);

  return (
    <div className="mt-7 divide-y divide-[#7f4b32]/72">
      {CREATE_STAT_ORDER.map((stat) => (
        <div
          key={stat}
          data-testid={`create-stat-row-${stat}`}
          className="grid min-h-[104px] grid-cols-[minmax(0,1fr)_9.8rem] items-center gap-3 py-4"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <h3 className="vc-reading-serif text-[28px] font-semibold leading-none text-[#ffb767]">
                {STAT_LABELS[stat]}
              </h3>
              <span className="vc-reading-serif text-[20px] font-semibold leading-none text-[#ffb767]">
                当前：{stats[stat]}
              </span>
            </div>
            <p className="mt-3 whitespace-pre-line vc-reading-serif text-[18px] leading-[1.45] text-[#d98b50]">
              {STAT_DESCRIPTIONS[stat]}
            </p>
          </div>

          <div className="grid grid-cols-[2.5rem_1fr_2.5rem] items-center gap-3">
            <button
              type="button"
              data-testid={`create-stat-decrement-${stat}`}
              aria-label={`减少${STAT_LABELS[stat]}`}
              disabled={stats[stat] <= BASE_STATS[stat]}
              onPointerDown={(event) => {
                releasePointerCapture(event);
                stepper.handlePointerDown(stat, -1);
              }}
              onPointerUp={stepper.handlePointerUp}
              onPointerCancel={stepper.handlePointerUp}
              onPointerLeave={stepper.handlePointerUp}
              className={stepButtonClass}
            >
              −
            </button>
            <div
              data-testid={`create-stat-value-${stat}`}
              className="vc-reading-serif text-center text-[28px] leading-none text-[#ffb767]"
            >
              {stats[stat]}
            </div>
            <button
              type="button"
              data-testid={`create-stat-increment-${stat}`}
              aria-label={`增加${STAT_LABELS[stat]}`}
              disabled={remaining <= 0}
              onPointerDown={(event) => {
                releasePointerCapture(event);
                stepper.handlePointerDown(stat, 1);
              }}
              onPointerUp={stepper.handlePointerUp}
              onPointerCancel={stepper.handlePointerUp}
              onPointerLeave={stepper.handlePointerUp}
              className={stepButtonClass}
            >
              +
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
