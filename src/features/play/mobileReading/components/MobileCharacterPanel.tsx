"use client";

import type { ReactNode } from "react";
import type { StatType } from "@/lib/registry/types";
import { formatCompactLocationLabel } from "@/lib/ui/locationLabels";
import { STAT_LABELS, STAT_MAX, STAT_ORDER } from "../../playConstants";
import {
  canUpgradeMobileCharacterAttribute,
  formatMobileCharacterProfession,
  formatMobileCharacterTime,
  getMobileCharacterUpgradeCost,
} from "../characterFormat";
import { MobileReadingIcons } from "../icons";
import type { MobileCharacterPanelProps } from "../types";

const STAT_DESCRIPTIONS: Record<StatType, string> = {
  sanity: "影响洞察、抗压与异常感知。",
  agility: "影响行动、反应与脱险判断。",
  luck: "影响隐藏线索与意外事件触发。",
  charm: "影响说服、信任建立与人物关系。",
  background: "决定每回合获得的原石数量。",
};

function PanelCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-[10px] border border-[#b76239]/88 bg-[#04131c]/62 shadow-[inset_0_0_26px_rgba(231,139,72,0.035)] ${className}`}
    >
      {children}
    </section>
  );
}

function CardTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="vc-reading-serif text-center text-[24px] font-semibold leading-none text-[#ffb761] drop-shadow-[0_0_10px_rgba(255,177,95,0.22)] min-[420px]:text-[26px]">
      {children}
    </h2>
  );
}

export function MobileCharacterPanel({
  stats,
  historicalMaxSanity,
  originium,
  time,
  playerLocation,
  currentProfession,
  onUpgradeAttribute,
}: MobileCharacterPanelProps) {
  const upgradeCost = getMobileCharacterUpgradeCost(stats);
  const professionLabel = formatMobileCharacterProfession(currentProfession);
  const timeLabel = formatMobileCharacterTime(time);
  const locationLabel = formatCompactLocationLabel(playerLocation);

  return (
    <section
      data-testid="mobile-character-panel"
      className="box-border flex h-full min-h-0 flex-col overflow-hidden px-5 pb-[calc(var(--vc-mobile-bottom-nav-height)+0.95rem+env(safe-area-inset-bottom))] pt-4 text-[#f1ad62] min-[420px]:px-6 min-[420px]:pt-5"
      aria-label="角色"
    >
      <div className="mb-3 flex h-[3.65rem] shrink-0 items-center justify-between gap-3 min-[420px]:mb-4 min-[420px]:h-[4.1rem]">
        <h1 className="vc-reading-serif text-[33px] font-semibold leading-none text-[#ffb15f] drop-shadow-[0_0_14px_rgba(255,177,95,0.22)] min-[420px]:text-[38px]">
          角色
        </h1>
        <button
          type="button"
          aria-label="原石余额"
          title="原石余额"
          disabled
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-[9px] border border-[#c86f43]/92 bg-[#071823]/78 px-3 text-[#ffba63] shadow-[inset_0_0_14px_rgba(255,177,95,0.06)] disabled:opacity-100 min-[420px]:h-11 min-[420px]:px-4"
        >
          <MobileReadingIcons.Originium className="h-7 w-7 shrink-0 text-[#d9944d]" strokeWidth={1.15} />
          <span data-testid="character-originium-balance" className="vc-reading-serif text-[20px] font-semibold leading-none min-[420px]:text-[22px]">
            原石 {originium}
          </span>
          <span
            aria-hidden
            className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-[#e6a764]/80 text-[18px] leading-none"
          >
            +
          </span>
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 min-[420px]:gap-4">
        <PanelCard className="shrink-0 px-4 py-3 min-[420px]:px-5 min-[420px]:py-4">
          <CardTitle>身份信息</CardTitle>
          <dl className="mt-3 divide-y divide-[#8f5435]/80 border-t border-[#8f5435]/80 min-[420px]:mt-4">
            <div className="grid grid-cols-[5.9rem_minmax(0,1fr)] items-center gap-3 py-2 min-[420px]:grid-cols-[7rem_minmax(0,1fr)] min-[420px]:py-2.5">
              <dt className="vc-reading-serif text-[20px] font-semibold text-[#ffba63] min-[420px]:text-[23px]">当前职业</dt>
              <dd data-testid="character-current-profession" className="vc-reading-serif min-w-0 truncate text-[20px] text-[#ffb15f] min-[420px]:text-[23px]">
                {professionLabel}
              </dd>
            </div>
            <div className="grid grid-cols-[5.9rem_minmax(0,1fr)] items-center gap-3 py-2 min-[420px]:grid-cols-[7rem_minmax(0,1fr)] min-[420px]:py-2.5">
              <dt className="vc-reading-serif text-[20px] font-semibold text-[#ffba63] min-[420px]:text-[23px]">当前时间</dt>
              <dd data-testid="character-current-time" className="vc-reading-serif min-w-0 truncate text-[20px] text-[#ffb15f] min-[420px]:text-[23px]">
                {timeLabel}
              </dd>
            </div>
            <div className="grid grid-cols-[5.9rem_minmax(0,1fr)] items-center gap-3 py-2 min-[420px]:grid-cols-[7rem_minmax(0,1fr)] min-[420px]:py-2.5">
              <dt className="vc-reading-serif text-[20px] font-semibold text-[#ffba63] min-[420px]:text-[23px]">当前位置</dt>
              <dd data-testid="character-current-location" className="vc-reading-serif min-w-0 truncate text-[20px] text-[#ffb15f] min-[420px]:text-[23px]">
                {locationLabel}
              </dd>
            </div>
          </dl>
        </PanelCard>

        <PanelCard className="flex min-h-0 flex-1 flex-col px-4 py-3 min-[420px]:px-5 min-[420px]:py-4">
          <CardTitle>当前属性</CardTitle>
          <div className="mt-3 grid min-h-0 flex-1 grid-rows-5 border-t border-[#6f4632]/80 min-[420px]:mt-4">
            {STAT_ORDER.map((stat) => {
              const value = stats[stat] ?? 0;
              const displayMax = stat === "sanity" ? historicalMaxSanity : STAT_MAX;
              const canUpgrade = canUpgradeMobileCharacterAttribute(stat, stats, originium);
              return (
                <div
                  key={stat}
                  data-testid={`character-stat-${stat}`}
                  className="grid min-h-0 grid-cols-[3.15rem_3.35rem_minmax(0,1fr)_3.15rem] items-center gap-1.5 border-b border-[#614230]/80 last:border-b-0 min-[420px]:grid-cols-[3.55rem_4.15rem_minmax(0,1fr)_3.45rem] min-[420px]:gap-2"
                >
                  <div className="vc-reading-serif text-[21px] font-semibold leading-none text-[#ffba63] min-[420px]:text-[24px]">
                    {STAT_LABELS[stat]}
                  </div>
                  <div
                    data-testid={`character-stat-${stat}-value`}
                    className="vc-reading-serif whitespace-nowrap border-r border-[#7d5239]/85 pr-1.5 text-center text-[17px] leading-none text-[#ffb15f] min-[420px]:pr-2.5 min-[420px]:text-[20px]"
                  >
                    {value} / {displayMax}
                  </div>
                  <div className="vc-reading-serif min-w-0 text-[14px] leading-[1.15] text-[#ffb15f] min-[420px]:text-[16px]">
                    {STAT_DESCRIPTIONS[stat]}
                  </div>
                  <button
                    type="button"
                    data-testid={`character-upgrade-${stat}`}
                    aria-label={`提升${STAT_LABELS[stat]}`}
                    title={`消耗 ${upgradeCost} 原石加点`}
                    disabled={!canUpgrade}
                    onClick={() => onUpgradeAttribute(stat)}
                    className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-[8px] border border-[#b76239]/90 bg-[#061722]/72 text-[#ffba63] shadow-[inset_0_0_12px_rgba(255,177,95,0.04)] transition enabled:active:scale-95 disabled:cursor-not-allowed disabled:opacity-45 min-[420px]:h-12 min-[420px]:w-12"
                  >
                    <span className="text-[18px] leading-none min-[420px]:text-[20px]">+</span>
                    <span className="vc-reading-serif text-[12px] leading-none min-[420px]:text-[14px]">加点</span>
                  </button>
                </div>
              );
            })}
          </div>
        </PanelCard>
      </div>
    </section>
  );
}
