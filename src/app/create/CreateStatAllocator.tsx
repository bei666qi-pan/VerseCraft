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
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#c8c3ba] bg-[#f7f3ec]/90 vc-reading-serif text-[24px] leading-none text-[#164f4d] shadow-[0_10px_20px_rgba(62,72,68,0.09),inset_0_1px_0_rgba(255,255,255,0.88)] transition enabled:hover:bg-[#fbf8f3] enabled:active:scale-90 disabled:cursor-not-allowed disabled:opacity-35";

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
    <div className="mt-4 divide-y divide-[#d8d3ca]">
      {CREATE_STAT_ORDER.map((stat) => (
        <div
          key={stat}
          data-testid={`create-stat-row-${stat}`}
          className="grid min-h-[68px] grid-cols-[minmax(0,1fr)_8.5rem] items-center gap-3 py-2.5"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <h3 className="vc-reading-serif text-[22px] font-semibold leading-none text-[#164f4d]">
                {STAT_LABELS[stat]}
              </h3>
              <span className="vc-reading-serif text-[16px] font-semibold leading-none text-[#164f4d]">
                当前：{stats[stat]}
              </span>
            </div>
            <p className="mt-1.5 whitespace-pre-line vc-reading-serif text-[14px] leading-[1.22] text-[#365f5d]">
              {STAT_DESCRIPTIONS[stat]}
            </p>
          </div>

          <div className="grid grid-cols-[2.25rem_1fr_2.25rem] items-center gap-2">
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
              className="vc-reading-serif text-center text-[26px] leading-none text-[#164f4d]"
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
