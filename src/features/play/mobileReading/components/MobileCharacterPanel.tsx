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

function CardTitle({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-center gap-2 text-[#8fa79f]" aria-hidden={false}>
      <span className="text-[14px] leading-none">✦</span>
      <h2 className="vc-reading-serif text-[24px] font-semibold leading-none text-[#174d46] min-[420px]:text-[28px]">
        {children}
      </h2>
      <span className="text-[14px] leading-none">✦</span>
    </div>
  );
}

function CharacterLogoDivider() {
  return (
    <div
      data-testid="character-logo-divider"
      className="my-2.5 flex shrink-0 items-center gap-3 text-[#8fa79f] min-[420px]:my-3"
      aria-hidden
    >
      <span className="h-px flex-1 bg-[#ded8ce]" />
      <MobileReadingIcons.BrandMark className="h-8 w-8 shrink-0 text-[#2f746a]" strokeWidth={1.4} />
      <span className="h-px flex-1 bg-[#ded8ce]" />
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
      className="box-border flex h-full min-h-0 flex-col overflow-hidden bg-[#fbf8f2] px-5 pb-[calc(var(--vc-mobile-bottom-nav-height)+0.7rem+env(safe-area-inset-bottom))] pt-[max(0.65rem,env(safe-area-inset-top))] text-[#174d46] min-[420px]:px-6 min-[420px]:pt-[max(0.85rem,env(safe-area-inset-top))]"
      aria-label="角色"
    >
      <div className="mx-auto flex h-full min-h-0 w-full max-w-[430px] flex-col">
        <section data-testid="character-identity-section" className="shrink-0 px-1">
          <CardTitle>身份信息</CardTitle>
          <dl className="mt-3 divide-y divide-[#ded8ce] border-t border-[#ded8ce]">
            <div className="grid grid-cols-[5.4rem_minmax(0,1fr)] items-center gap-3 py-2.5 min-[420px]:grid-cols-[6.7rem_minmax(0,1fr)] min-[420px]:py-3">
              <dt className="vc-reading-serif text-[20px] font-semibold leading-none min-[420px]:text-[24px]">
                当前职业
              </dt>
              <dd
                data-testid="character-current-profession"
                className="vc-reading-serif min-w-0 truncate text-[20px] leading-none min-[420px]:text-[24px]"
              >
                {professionLabel}
              </dd>
            </div>
            <div className="grid grid-cols-[5.4rem_minmax(0,1fr)] items-center gap-3 py-2.5 min-[420px]:grid-cols-[6.7rem_minmax(0,1fr)] min-[420px]:py-3">
              <dt className="vc-reading-serif text-[20px] font-semibold leading-none min-[420px]:text-[24px]">
                当前时间
              </dt>
              <dd
                data-testid="character-current-time"
                className="vc-reading-serif min-w-0 truncate text-[20px] leading-none min-[420px]:text-[24px]"
              >
                {timeLabel}
              </dd>
            </div>
            <div className="grid grid-cols-[5.4rem_minmax(0,1fr)] items-center gap-3 py-2.5 min-[420px]:grid-cols-[6.7rem_minmax(0,1fr)] min-[420px]:py-3">
              <dt className="vc-reading-serif text-[20px] font-semibold leading-none min-[420px]:text-[24px]">
                当前位置
              </dt>
              <dd
                data-testid="character-current-location"
                className="vc-reading-serif min-w-0 truncate text-[20px] leading-none min-[420px]:text-[24px]"
              >
                {locationLabel}
              </dd>
            </div>
          </dl>
        </section>

        <CharacterLogoDivider />

        <section data-testid="character-attributes-section" className="min-h-0 flex-1 px-1">
          <div className="flex items-center justify-between gap-3 border-b border-[#ded8ce] pb-2.5">
            <div className="flex items-center gap-2">
              <h2 className="vc-reading-serif text-[24px] font-semibold leading-none text-[#174d46] min-[420px]:text-[28px]">
                当前属性
              </h2>
              <span className="text-[#8fa79f]" aria-hidden>✦</span>
            </div>
            <div
              aria-label="原石余额"
              title="原石余额"
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] border border-[#d8d1c6] bg-[#fffdf8] px-2.5 text-[#174d46] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] min-[420px]:h-10 min-[420px]:px-3"
            >
              <MobileReadingIcons.Originium className="h-5 w-5 shrink-0 text-[#2f746a] min-[420px]:h-6 min-[420px]:w-6" strokeWidth={1.25} />
              <span
                data-testid="character-originium-balance"
                className="vc-reading-serif text-[16px] font-semibold leading-none min-[420px]:text-[18px]"
              >
                原石 {originium}
              </span>
            </div>
          </div>

          <div className="min-h-0 divide-y divide-[#ded8ce]">
            {STAT_ORDER.map((stat) => {
              const value = stats[stat] ?? 0;
              const displayMax = stat === "sanity" ? historicalMaxSanity : STAT_MAX;
              const canUpgrade = canUpgradeMobileCharacterAttribute(stat, stats, originium);
              return (
                <div
                  key={stat}
                  data-testid={`character-stat-${stat}`}
                  className="grid min-h-[3.55rem] grid-cols-[2.95rem_3.55rem_minmax(0,1fr)_3.05rem] items-center gap-1.5 py-1.5 min-[420px]:min-h-[4rem] min-[420px]:grid-cols-[3.45rem_4.15rem_minmax(0,1fr)_3.45rem] min-[420px]:gap-2"
                >
                  <div className="vc-reading-serif whitespace-nowrap text-[19px] font-semibold leading-none min-[420px]:text-[22px]">
                    {STAT_LABELS[stat]}
                  </div>
                  <div
                    data-testid={`character-stat-${stat}-value`}
                    className="vc-reading-serif whitespace-nowrap text-[15px] leading-none min-[420px]:text-[18px]"
                  >
                    {value} / {displayMax}
                  </div>
                  <div
                    data-testid={`character-stat-${stat}-description`}
                    className="vc-reading-serif min-w-0 truncate whitespace-nowrap text-[12px] leading-none text-[#4f706a] min-[420px]:text-[14px]"
                  >
                    {STAT_DESCRIPTIONS[stat]}
                  </div>
                  <button
                    type="button"
                    data-testid={`character-upgrade-${stat}`}
                    aria-label={`提升${STAT_LABELS[stat]}`}
                    title={`消耗 ${upgradeCost} 原石加点`}
                    disabled={!canUpgrade}
                    onClick={() => onUpgradeAttribute(stat)}
                    className="flex h-11 w-[3.05rem] shrink-0 flex-col items-center justify-center rounded-[10px] border border-[#d8d1c6] bg-[#fffdf8] text-[#174d46] shadow-[0_5px_12px_rgba(73,63,51,0.08)] transition enabled:hover:bg-white enabled:active:scale-95 disabled:cursor-not-allowed disabled:opacity-42 min-[420px]:h-12 min-[420px]:w-[3.45rem]"
                  >
                    <span className="text-[18px] font-semibold leading-none min-[420px]:text-[20px]">+</span>
                    <span className="vc-reading-serif text-[12px] leading-none min-[420px]:text-[13px]">加点</span>
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </section>
  );
}
