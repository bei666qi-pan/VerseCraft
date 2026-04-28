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
  sanity: "影响洞察与异常感知",
  agility: "影响行动与反应能力",
  luck: "影响隐藏线索与意外事件",
  charm: "影响说服与人际关系",
  background: "影响每回合原石获取数量",
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
      className={`rounded-[18px] border border-[#d8d1c6] bg-[#fffdf8]/92 shadow-[0_10px_24px_rgba(73,63,51,0.1),inset_0_1px_0_rgba(255,255,255,0.95)] ${className}`}
    >
      {children}
    </section>
  );
}

function CardTitle({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-center gap-3 text-[#8fa79f]" aria-hidden={false}>
      <span className="text-[18px] leading-none">✦</span>
      <h2 className="vc-reading-serif text-[31px] font-semibold leading-none text-[#174d46] min-[420px]:text-[38px]">
        {children}
      </h2>
      <span className="text-[18px] leading-none">✦</span>
    </div>
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
      className="box-border h-full min-h-0 overflow-y-auto px-5 pb-[calc(var(--vc-mobile-bottom-nav-height)+1.25rem+env(safe-area-inset-bottom))] pt-5 text-[#174d46] [scrollbar-width:none] min-[420px]:px-6 [&::-webkit-scrollbar]:hidden"
      aria-label="角色"
    >
      <div className="mx-auto flex max-w-[430px] flex-col gap-5">
        <PanelCard className="px-5 py-5 min-[420px]:px-6 min-[420px]:py-6">
          <CardTitle>身份信息</CardTitle>
          <dl className="mt-5 divide-y divide-[#ded8ce] border-t border-[#ded8ce]">
            <div className="grid grid-cols-[6.4rem_minmax(0,1fr)] items-center gap-4 py-4 min-[420px]:grid-cols-[8rem_minmax(0,1fr)]">
              <dt className="vc-reading-serif text-[24px] font-semibold leading-none min-[420px]:text-[31px]">
                当前职业
              </dt>
              <dd
                data-testid="character-current-profession"
                className="vc-reading-serif min-w-0 truncate text-[24px] leading-none min-[420px]:text-[31px]"
              >
                {professionLabel}
              </dd>
            </div>
            <div className="grid grid-cols-[6.4rem_minmax(0,1fr)] items-center gap-4 py-4 min-[420px]:grid-cols-[8rem_minmax(0,1fr)]">
              <dt className="vc-reading-serif text-[24px] font-semibold leading-none min-[420px]:text-[31px]">
                当前时间
              </dt>
              <dd
                data-testid="character-current-time"
                className="vc-reading-serif min-w-0 truncate text-[24px] leading-none min-[420px]:text-[31px]"
              >
                {timeLabel}
              </dd>
            </div>
            <div className="grid grid-cols-[6.4rem_minmax(0,1fr)] items-center gap-4 py-4 min-[420px]:grid-cols-[8rem_minmax(0,1fr)]">
              <dt className="vc-reading-serif text-[24px] font-semibold leading-none min-[420px]:text-[31px]">
                当前位置
              </dt>
              <dd
                data-testid="character-current-location"
                className="vc-reading-serif min-w-0 truncate text-[24px] leading-none min-[420px]:text-[31px]"
              >
                {locationLabel}
              </dd>
            </div>
          </dl>
        </PanelCard>

        <PanelCard className="px-5 py-5 min-[420px]:px-6 min-[420px]:py-6">
          <div className="flex items-center justify-between gap-3 border-b border-[#ded8ce] pb-4">
            <div className="flex items-center gap-2">
              <h2 className="vc-reading-serif text-[30px] font-semibold leading-none text-[#174d46] min-[420px]:text-[38px]">
                当前属性
              </h2>
              <span className="text-[#8fa79f]" aria-hidden>✦</span>
            </div>
            <div
              aria-label="原石余额"
              title="原石余额"
              className="inline-flex h-11 shrink-0 items-center gap-2 rounded-[10px] border border-[#d8d1c6] bg-[#fbf8f2] px-3 text-[#174d46] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] min-[420px]:h-[3.4rem] min-[420px]:px-5"
            >
              <MobileReadingIcons.Originium className="h-7 w-7 shrink-0 text-[#2f746a]" strokeWidth={1.25} />
              <span
                data-testid="character-originium-balance"
                className="vc-reading-serif text-[19px] font-semibold leading-none min-[420px]:text-[25px]"
              >
                原石 {originium}
              </span>
            </div>
          </div>

          <div className="divide-y divide-[#ded8ce]">
            {STAT_ORDER.map((stat) => {
              const value = stats[stat] ?? 0;
              const displayMax = stat === "sanity" ? historicalMaxSanity : STAT_MAX;
              const canUpgrade = canUpgradeMobileCharacterAttribute(stat, stats, originium);
              return (
                <div
                  key={stat}
                  data-testid={`character-stat-${stat}`}
                  className="grid min-h-[5.2rem] grid-cols-[3.9rem_4.25rem_minmax(0,1fr)_3.75rem] items-center gap-2 py-3 min-[420px]:grid-cols-[4.6rem_5.2rem_minmax(0,1fr)_4.25rem] min-[420px]:gap-3"
                >
                  <div className="vc-reading-serif whitespace-nowrap text-[25px] font-semibold leading-none min-[420px]:text-[34px]">
                    {STAT_LABELS[stat]}
                  </div>
                  <div
                    data-testid={`character-stat-${stat}-value`}
                    className="vc-reading-serif whitespace-nowrap text-[20px] leading-none min-[420px]:text-[28px]"
                  >
                    {value} / {displayMax}
                  </div>
                  <div className="vc-reading-serif min-w-0 text-[14px] leading-snug text-[#4f706a] min-[420px]:text-[20px]">
                    {STAT_DESCRIPTIONS[stat]}
                  </div>
                  <button
                    type="button"
                    data-testid={`character-upgrade-${stat}`}
                    aria-label={`提升${STAT_LABELS[stat]}`}
                    title={`消耗 ${upgradeCost} 原石加点`}
                    disabled={!canUpgrade}
                    onClick={() => onUpgradeAttribute(stat)}
                    className="flex h-14 w-[3.7rem] shrink-0 flex-col items-center justify-center rounded-[10px] border border-[#d8d1c6] bg-[#fffdf8] text-[#174d46] shadow-[0_5px_12px_rgba(73,63,51,0.08)] transition enabled:hover:bg-white enabled:active:scale-95 disabled:cursor-not-allowed disabled:opacity-42 min-[420px]:h-[4rem] min-[420px]:w-[4.25rem]"
                  >
                    <span className="text-[22px] font-semibold leading-none min-[420px]:text-[28px]">+</span>
                    <span className="vc-reading-serif text-[15px] leading-none min-[420px]:text-[20px]">加点</span>
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
