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
import { mobileReadingTheme } from "../theme";
import type { MobileCharacterPanelProps } from "../types";

const STAT_DESCRIPTIONS: Record<StatType, string> = {
  sanity: "影响洞察、抗压与异常感知。",
  agility: "影响行动、反应与脱险判断。",
  luck: "影响隐藏线索与意外事件触发。",
  charm: "影响说服、信任建立与人物关系。",
  background: "决定每回合获得的原石数量。",
};

function CharacterSection({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="rounded-[8px] border border-[#c86f43]/85 bg-[#05131c]/50 px-4 py-4 shadow-[inset_0_0_24px_rgba(235,158,91,0.03)]">
      <h2 className="vc-reading-serif text-center text-[26px] font-semibold leading-none text-[#ffba63] drop-shadow-[0_0_10px_rgba(255,170,90,0.28)]">
        {title}
      </h2>
      <div className="mt-4 border-t border-[#b7774f]/55">{children}</div>
    </section>
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
      className="px-5 pb-[calc(var(--vc-mobile-bottom-nav-height)+2rem+env(safe-area-inset-bottom))] pt-6 text-[#f1ad62]"
      aria-label="角色"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h1 className="vc-reading-serif text-[32px] font-semibold leading-none text-[#ffb15f] drop-shadow-[0_0_12px_rgba(255,177,95,0.26)]">
          角色
        </h1>
        <button
          type="button"
          aria-label="原石余额"
          title="原石余额"
          disabled
          className="inline-flex h-11 items-center gap-2 rounded-[10px] border border-[#c86f43]/90 bg-[#081722]/80 px-3 text-[#ffba63] shadow-[inset_0_0_14px_rgba(255,177,95,0.05)] disabled:opacity-100"
        >
          <MobileReadingIcons.Originium className="h-7 w-7 shrink-0 text-[#d9944d]" strokeWidth={1.15} />
          <span data-testid="character-originium-balance" className="vc-reading-serif text-[22px] font-semibold leading-none">
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

      <div className="space-y-4">
        <CharacterSection title="身份信息">
          <dl className="divide-y divide-[#b7774f]/55">
            <div className="grid grid-cols-[6.6rem_minmax(0,1fr)] items-center gap-3 py-3">
              <dt className="vc-reading-serif text-[22px] font-semibold text-[#ffba63]">当前职业</dt>
              <dd data-testid="character-current-profession" className="vc-reading-serif min-w-0 text-[22px] text-[#ffb15f]">
                {professionLabel}
              </dd>
            </div>
            <div className="grid grid-cols-[6.6rem_minmax(0,1fr)] items-center gap-3 py-3">
              <dt className="vc-reading-serif text-[22px] font-semibold text-[#ffba63]">当前时间</dt>
              <dd data-testid="character-current-time" className="vc-reading-serif min-w-0 text-[22px] text-[#ffb15f]">
                {timeLabel}
              </dd>
            </div>
            <div className="grid grid-cols-[6.6rem_minmax(0,1fr)] items-center gap-3 py-3">
              <dt className="vc-reading-serif text-[22px] font-semibold text-[#ffba63]">当前位置</dt>
              <dd data-testid="character-current-location" className="vc-reading-serif min-w-0 text-[22px] text-[#ffb15f]">
                {locationLabel}
              </dd>
            </div>
          </dl>
        </CharacterSection>

        <CharacterSection title="当前属性">
          <div className="divide-y divide-[#7c543d]/70">
            {STAT_ORDER.map((stat) => {
              const value = stats[stat] ?? 0;
              const displayMax = stat === "sanity" ? historicalMaxSanity : STAT_MAX;
              const canUpgrade = canUpgradeMobileCharacterAttribute(stat, stats, originium);
              return (
                <div
                  key={stat}
                  data-testid={`character-stat-${stat}`}
                  className="grid min-h-[100px] grid-cols-[3.55rem_4.35rem_minmax(0,1fr)_3.55rem] items-center gap-1.5 py-4 min-[420px]:grid-cols-[4rem_5rem_minmax(0,1fr)_4rem] min-[420px]:gap-2"
                >
                  <div className="vc-reading-serif text-[24px] font-semibold leading-none text-[#ffba63]">
                    {STAT_LABELS[stat]}
                  </div>
                  <div
                    data-testid={`character-stat-${stat}-value`}
                    className="vc-reading-serif border-r border-[#8c5a3f]/80 pr-2 text-center text-[21px] leading-none text-[#ffb15f] min-[420px]:pr-3 min-[420px]:text-[22px]"
                  >
                    {value} / {displayMax}
                  </div>
                  <div className="vc-reading-serif min-w-0 text-[17px] leading-relaxed text-[#ffb15f] min-[420px]:text-[19px]">
                    {STAT_DESCRIPTIONS[stat]}
                  </div>
                  <button
                    type="button"
                    data-testid={`character-upgrade-${stat}`}
                    aria-label={`提升${STAT_LABELS[stat]}`}
                    title={`消耗 ${upgradeCost} 原石加点`}
                    disabled={!canUpgrade}
                    onClick={() => onUpgradeAttribute(stat)}
                    className={`${mobileReadingTheme.iconButton} h-[52px] w-[52px] flex-col rounded-[8px] border-[#c86f43]/90 bg-[#061722]/70 text-[#ffba63] disabled:opacity-45 min-[420px]:h-[58px] min-[420px]:w-[58px]`}
                  >
                    <span className="text-[20px] leading-none">+</span>
                    <span className="vc-reading-serif text-[14px] leading-none">加点</span>
                  </button>
                </div>
              );
            })}
          </div>
        </CharacterSection>
      </div>
    </section>
  );
}
