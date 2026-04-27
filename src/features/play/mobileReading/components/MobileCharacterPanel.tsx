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
      className={`rounded-[9px] border border-[#9f5f39]/88 bg-[#04131c]/62 shadow-[inset_0_0_34px_rgba(10,40,52,0.35),0_0_0_1px_rgba(233,157,88,0.08)] ${className}`}
    >
      {children}
    </section>
  );
}

function CardTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="vc-reading-serif text-center text-[32px] font-semibold leading-none text-[#ffbc70] drop-shadow-[0_0_12px_rgba(255,177,95,0.24)] min-[420px]:text-[38px]">
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
      className="box-border h-full min-h-0 overflow-y-auto px-4 pb-[calc(var(--vc-mobile-bottom-nav-height)+1rem+env(safe-area-inset-bottom))] pt-3 text-[#ffb86d] [scrollbar-width:none] min-[420px]:px-5 min-[420px]:pt-5 [&::-webkit-scrollbar]:hidden"
      aria-label="角色"
    >
      <div className="mx-auto flex max-w-[430px] flex-col gap-3 min-[420px]:gap-5">
        <PanelCard className="shrink-0 px-4 py-4 min-[420px]:px-5 min-[420px]:py-6">
          <CardTitle>身份信息</CardTitle>
          <dl className="mt-4 divide-y divide-[#9a5b37]/82 border-t border-[#9a5b37]/82 min-[420px]:mt-6">
            <div className="grid grid-cols-[6.2rem_minmax(0,1fr)] items-center gap-4 py-2.5 min-[420px]:grid-cols-[8.4rem_minmax(0,1fr)] min-[420px]:py-4">
              <dt className="vc-reading-serif text-[23px] font-semibold leading-none text-[#ffbd72] min-[420px]:text-[31px]">
                当前职业
              </dt>
              <dd data-testid="character-current-profession" className="vc-reading-serif min-w-0 truncate text-[23px] leading-none text-[#ffb86d] min-[420px]:text-[31px]">
                {professionLabel}
              </dd>
            </div>
            <div className="grid grid-cols-[6.2rem_minmax(0,1fr)] items-center gap-4 py-2.5 min-[420px]:grid-cols-[8.4rem_minmax(0,1fr)] min-[420px]:py-4">
              <dt className="vc-reading-serif text-[23px] font-semibold leading-none text-[#ffbd72] min-[420px]:text-[31px]">
                当前时间
              </dt>
              <dd data-testid="character-current-time" className="vc-reading-serif min-w-0 truncate text-[23px] leading-none text-[#ffb86d] min-[420px]:text-[31px]">
                {timeLabel}
              </dd>
            </div>
            <div className="grid grid-cols-[6.2rem_minmax(0,1fr)] items-center gap-4 py-2.5 min-[420px]:grid-cols-[8.4rem_minmax(0,1fr)] min-[420px]:py-4">
              <dt className="vc-reading-serif text-[23px] font-semibold leading-none text-[#ffbd72] min-[420px]:text-[31px]">
                当前位置
              </dt>
              <dd data-testid="character-current-location" className="vc-reading-serif min-w-0 truncate text-[23px] leading-none text-[#ffb86d] min-[420px]:text-[31px]">
                {locationLabel}
              </dd>
            </div>
          </dl>
        </PanelCard>

        <PanelCard className="flex flex-col px-4 py-4 min-[420px]:px-5 min-[420px]:py-6">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[#9a5b37]/82 pb-3">
            <h2 className="vc-reading-serif text-[29px] font-semibold leading-none text-[#ffbd72] drop-shadow-[0_0_12px_rgba(255,177,95,0.2)] min-[420px]:text-[38px]">
              当前属性
            </h2>
            <div
              aria-label="原石余额"
              title="原石余额"
              className="inline-flex h-11 shrink-0 items-center gap-2 rounded-[9px] border border-[#a8663c]/92 bg-[#071823]/78 px-3 text-[#ffba63] shadow-[inset_0_0_14px_rgba(255,177,95,0.06)] min-[420px]:h-[3.55rem] min-[420px]:px-5"
            >
              <MobileReadingIcons.Originium className="h-7 w-7 shrink-0 text-[#d9944d] min-[420px]:h-8 min-[420px]:w-8" strokeWidth={1.15} />
              <span data-testid="character-originium-balance" className="vc-reading-serif text-[19px] font-semibold leading-none min-[420px]:text-[25px]">
                原石 {originium}
              </span>
            </div>
          </div>

          <div className="grid min-h-0 flex-1 grid-rows-5">
            {STAT_ORDER.map((stat) => {
              const value = stats[stat] ?? 0;
              const displayMax = stat === "sanity" ? historicalMaxSanity : STAT_MAX;
              const canUpgrade = canUpgradeMobileCharacterAttribute(stat, stats, originium);
              return (
                <div
                  key={stat}
                  data-testid={`character-stat-${stat}`}
                  className="grid min-h-[3.65rem] grid-cols-[3.8rem_4.05rem_minmax(0,1fr)_3.35rem] items-center gap-1.5 border-b border-[#805033]/82 last:border-b-0 min-[420px]:min-h-[5.4rem] min-[420px]:grid-cols-[4.2rem_5.3rem_minmax(0,1fr)_4.25rem] min-[420px]:gap-3"
                >
                  <div className="vc-reading-serif whitespace-nowrap text-[23px] font-semibold leading-none text-[#ffbd72] min-[420px]:text-[34px]">
                    {STAT_LABELS[stat]}
                  </div>
                  <div
                    data-testid={`character-stat-${stat}-value`}
                    className="vc-reading-serif whitespace-nowrap text-[19px] leading-none text-[#ffb86d] min-[420px]:text-[29px]"
                  >
                    {value} / {displayMax}
                  </div>
                  <div className="vc-reading-serif min-w-0 text-[13px] leading-snug text-[#f0a967] min-[420px]:text-[21px]">
                    {STAT_DESCRIPTIONS[stat]}
                  </div>
                  <button
                    type="button"
                    data-testid={`character-upgrade-${stat}`}
                    aria-label={`提升${STAT_LABELS[stat]}`}
                    title={`消耗 ${upgradeCost} 原石加点`}
                    disabled={!canUpgrade}
                    onClick={() => onUpgradeAttribute(stat)}
                    className="flex h-11 w-12 shrink-0 flex-col items-center justify-center rounded-[8px] border border-[#a8663c]/92 bg-[#061722]/78 text-[#ffba63] shadow-[inset_0_0_12px_rgba(255,177,95,0.04)] transition enabled:active:scale-95 disabled:cursor-not-allowed disabled:opacity-45 min-[420px]:h-[4rem] min-[420px]:w-[4.2rem]"
                  >
                    <span className="text-[19px] font-semibold leading-none min-[420px]:text-[27px]">+</span>
                    <span className="vc-reading-serif text-[13px] leading-none min-[420px]:text-[20px]">加点</span>
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
