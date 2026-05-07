"use client";

import { useEffect, useMemo, useState } from "react";
import { type CodexCatalogSlot } from "../codexCatalog";
import {
  buildMobileCodexCardModels,
  buildMobileCodexDetail,
  formatMobileCodexFloorLabel,
  getMobileCodexIdentifiedCount,
  getMobileCodexSlotsForFloor,
  resolveMobileCodexCurrentFloor,
  resolveMobileCodexInitialSelection,
  type MobileCodexCardModel,
} from "../codexFormat";
import { resolveCodexPortrait } from "../codexPortraits";
import { MobileReadingIcons } from "../icons";
import type { MobileCodexPanelProps } from "../types";

const UNKNOWN_CODEX_PLACEHOLDER = {
  src: "/assets/npc-avatars/codex-placeholder-unknown.png",
  alt: "尚未出现的图鉴占位图",
  objectPosition: "center top",
} as const;

function CodexSilhouette({ identified }: { identified: boolean }) {
  return (
    <div
      aria-hidden
      className={`absolute inset-0 overflow-hidden rounded-[14px] ${
        identified
          ? "bg-[radial-gradient(circle_at_50%_18%,rgba(47,116,106,0.16),transparent_22%),linear-gradient(160deg,#dce7e3,#f8f5ef)]"
          : "bg-[radial-gradient(circle_at_50%_27%,rgba(47,116,106,0.3)_0_14%,transparent_15%),linear-gradient(165deg,#f6f2ec,#fffdf8)]"
      }`}
    >
      <div
        className={`absolute left-1/2 top-[22%] h-[38%] w-[47%] -translate-x-1/2 rounded-full ${
          identified ? "bg-[#8fa79f]/50" : "bg-[#174d46]/78"
        }`}
      />
      <div
        className={`absolute bottom-0 left-1/2 h-[44%] w-[70%] -translate-x-1/2 rounded-t-full ${
          identified ? "bg-[#8fa79f]/45" : "bg-[#174d46]/76"
        }`}
      />
      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#fffdf8] to-transparent" />
    </div>
  );
}

function CodexCard({
  card,
  selected,
  onSelect,
}: {
  card: MobileCodexCardModel;
  selected: boolean;
  onSelect: (slot: CodexCatalogSlot) => void;
}) {
  const portrait =
    card.kind === "slot" ? (card.identified ? resolveCodexPortrait(card.id) : UNKNOWN_CODEX_PLACEHOLDER) : null;
  return (
    <button
      type="button"
      data-testid="mobile-codex-card"
      data-codex-id={card.id}
      aria-pressed={selected || undefined}
      disabled={card.disabled}
      onClick={() => {
        if (card.kind === "slot") onSelect(card.slot);
      }}
      className={`relative h-[146px] w-[82px] shrink-0 overflow-visible rounded-[14px] border bg-[#fffdf8] text-left shadow-[0_6px_16px_rgba(73,63,51,0.09)] transition min-[420px]:h-[168px] min-[420px]:w-[92px] ${
        selected
          ? "border-[#2f746a] shadow-[0_10px_22px_rgba(47,116,106,0.14),0_0_0_2px_rgba(47,116,106,0.06)]"
          : "border-[#d8d1c6]"
      } ${card.disabled ? "opacity-75" : "active:scale-[0.985]"}`}
    >
      <div className="absolute inset-0 overflow-hidden rounded-[13px]">
        {portrait ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={portrait.src}
            alt={portrait.alt}
            className="h-full w-full object-cover"
            style={{ objectPosition: portrait.objectPosition ?? "center top" }}
          />
        ) : (
          <CodexSilhouette identified={card.identified} />
        )}
        <div className="absolute inset-x-0 bottom-0 h-[4.2rem] bg-gradient-to-t from-[#fffdf8] via-[#fffdf8]/92 to-transparent" />
      </div>
      <div className="absolute inset-x-1 bottom-3">
        <div className="vc-reading-serif truncate text-center text-[17px] font-semibold leading-tight text-[#174d46] min-[420px]:text-[19px]">
          {card.displayName}
        </div>
        <div className="vc-reading-serif mt-1 truncate text-center text-[12px] leading-tight text-[#4f706a] min-[420px]:text-[14px]">
          {card.location}
        </div>
      </div>
      {selected ? (
        <span
          aria-hidden
          className="absolute -bottom-[7px] left-1/2 flex w-[58px] -translate-x-1/2 items-center justify-center"
        >
          <span className="h-px flex-1 bg-[#2f746a]" />
          <span className="mx-1 h-2.5 w-2.5 rounded-full bg-[#2f746a] shadow-[0_0_10px_rgba(47,116,106,0.38)]" />
          <span className="h-px flex-1 bg-[#2f746a]" />
        </span>
      ) : null}
    </button>
  );
}

function DetailDivider() {
  return (
    <div className="my-2.5 flex shrink-0 items-center gap-2 text-[#8fa79f] min-[420px]:my-3" aria-hidden>
      <span className="h-px flex-1 bg-[#ded8ce]" />
      <span className="text-[16px] leading-none">◇</span>
      <span className="h-px flex-1 bg-[#ded8ce]" />
    </div>
  );
}

function DetailBlock({
  icon,
  title,
  children,
  lines = 2,
  scrollable = false,
  testId,
}: {
  icon: "book" | "eye" | "heart";
  title: string;
  children: string;
  lines?: 1 | 2 | 3;
  scrollable?: boolean;
  testId?: string;
}) {
  const Icon =
    icon === "book"
      ? MobileReadingIcons.CodexBook
      : icon === "eye"
        ? MobileReadingIcons.CodexEye
        : MobileReadingIcons.CodexHeart;
  const clampClass =
    lines === 1 ? "[-webkit-line-clamp:1]" : lines === 3 ? "[-webkit-line-clamp:3]" : "[-webkit-line-clamp:2]";
  return (
    <section
      data-testid={testId}
      className={`relative min-h-0 pr-3 ${scrollable ? "flex flex-1 flex-col overflow-hidden" : "shrink-0"}`}
    >
      <h3 className="vc-reading-serif flex items-center gap-2 text-[20px] font-semibold leading-none text-[#174d46] min-[420px]:text-[24px]">
        <Icon className="h-5 w-5 shrink-0 text-[#2f746a] min-[420px]:h-6 min-[420px]:w-6" strokeWidth={1.45} />
        {title}
      </h3>
      <p
        className={
          scrollable
            ? "vc-reading-serif mt-1.5 min-h-0 flex-1 overflow-y-auto pr-1 text-[15px] leading-[1.48] text-[#1f4b45] min-[420px]:text-[17px]"
            : `vc-reading-serif mt-1.5 overflow-hidden text-[15px] leading-[1.42] text-[#1f4b45] [display:-webkit-box] [-webkit-box-orient:vertical] min-[420px]:text-[17px] ${clampClass}`
        }
      >
        {children}
      </p>
      {scrollable ? (
        <div
          aria-hidden
          className="absolute bottom-0 right-0 top-4 flex w-2 flex-col items-center justify-between text-[#2f746a]"
        >
          <span className="text-[11px] leading-none">⌃</span>
          <span className="my-1 h-8 w-0.5 rounded-full bg-[#2f746a] min-[420px]:h-10" />
          <span className="text-[11px] leading-none">⌄</span>
        </div>
      ) : null}
    </section>
  );
}

export function MobileCodexPanel({
  codex,
  dynamicNpcStates,
  mainThreatByFloor,
  playerLocation,
}: MobileCodexPanelProps) {
  const currentFloor = useMemo(() => resolveMobileCodexCurrentFloor(playerLocation), [playerLocation]);
  const floorLabel = formatMobileCodexFloorLabel(currentFloor);
  const floorSlots = useMemo(
    () =>
      getMobileCodexSlotsForFloor({
        codex,
        dynamicNpcStates,
        floorId: currentFloor,
        mainThreatByFloor,
      }),
    [codex, currentFloor, dynamicNpcStates, mainThreatByFloor]
  );
  const identifiedCount = getMobileCodexIdentifiedCount(codex, floorSlots);
  const cards = useMemo(
    () => buildMobileCodexCardModels(codex, floorSlots, { dynamicNpcStates }),
    [codex, dynamicNpcStates, floorSlots]
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const next = resolveMobileCodexInitialSelection(codex, floorSlots);
    setSelectedId((current) => {
      if (current && floorSlots.some((slot) => slot.id === current)) return current;
      return next;
    });
  }, [codex, floorSlots]);

  const selectedSlot = floorSlots.find((slot) => slot.id === selectedId) ?? floorSlots[0] ?? null;
  const selectedIndex = selectedSlot ? Math.max(0, floorSlots.findIndex((slot) => slot.id === selectedSlot.id)) : 0;
  const progressWidth =
    floorSlots.length > 0 ? Math.max(18, ((selectedIndex + 1) / floorSlots.length) * 100) : 0;
  const detail = selectedSlot ? buildMobileCodexDetail(codex, selectedSlot, { dynamicNpcStates }) : null;
  const introTitle = selectedSlot?.type === "anomaly" ? "异常简介" : "人物简介";
  const countPrefix = `${floorLabel}${floorLabel.endsWith("F") ? "" : "层"}已识别人物`;

  return (
    <section
      data-testid="mobile-codex-panel"
      aria-label="图鉴"
      className="box-border flex h-full min-h-0 flex-col overflow-hidden bg-[#fbf8f2] px-4 pb-[calc(var(--vc-mobile-bottom-nav-height)+0.75rem+env(safe-area-inset-bottom))] pt-[max(0.65rem,env(safe-area-inset-top))] text-[#174d46] min-[420px]:px-5 min-[420px]:pt-[max(0.85rem,env(safe-area-inset-top))]"
    >
      <div className="vc-reading-serif shrink-0 px-1 text-[20px] font-semibold leading-none min-[420px]:text-[24px]">
        <span data-testid="mobile-codex-count">
          {countPrefix}：{identifiedCount} / {floorSlots.length}
        </span>
      </div>

      <div
        data-testid="mobile-codex-card-strip"
        className="-mx-4 mt-3 flex shrink-0 gap-2.5 overflow-x-auto px-4 pb-4 pt-1 [scrollbar-width:none] [-ms-overflow-style:none] min-[420px]:-mx-5 min-[420px]:gap-3 min-[420px]:px-5 [&::-webkit-scrollbar]:hidden"
      >
        {cards.map((card) => (
          <CodexCard
            key={card.id}
            card={card}
            selected={card.kind === "slot" && card.id === selectedSlot?.id}
            onSelect={(slot) => setSelectedId(slot.id)}
          />
        ))}
      </div>

      {floorSlots.length === 0 ? (
        <div
          data-testid="mobile-codex-empty"
          className="vc-reading-serif mt-5 rounded-[18px] border border-[#d8d1c6] bg-[#fffdf8]/92 px-5 py-10 text-center text-[20px] text-[#4f706a] shadow-[0_8px_18px_rgba(73,63,51,0.08)]"
        >
          当前楼层暂无可记录对象
        </div>
      ) : (
        <>
          <div className="mx-auto mb-3 flex h-1.5 w-32 shrink-0 overflow-hidden rounded-full bg-[#e3ded6]" aria-hidden>
            <span
              className="rounded-full bg-[#2f746a] shadow-[0_0_10px_rgba(47,116,106,0.24)]"
              style={{ width: `${progressWidth}%` }}
            />
          </div>

          {detail && selectedSlot ? (
            <article
              data-testid="mobile-codex-detail-panel"
              className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[18px] border border-[#d8d1c6] bg-[#fffdf8]/94 px-4 py-4 shadow-[0_8px_18px_rgba(73,63,51,0.08),inset_0_1px_0_rgba(255,255,255,0.95)] min-[420px]:px-5 min-[420px]:py-5"
            >
              <header className="grid shrink-0 grid-cols-[1.9rem_minmax(0,1fr)] gap-2.5">
                <MobileReadingIcons.BrandMark className="mt-0.5 h-7 w-7 text-[#2f746a]" strokeWidth={1.5} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                    <div>
                      <h2
                        data-testid="mobile-codex-detail-name"
                        className="vc-reading-serif truncate text-[26px] font-semibold leading-none text-[#174d46] min-[420px]:text-[32px]"
                      >
                        {detail.name}
                      </h2>
                      <p
                        data-testid="mobile-codex-detail-location"
                        className="vc-reading-serif mt-1 truncate text-[17px] leading-none text-[#4f706a] min-[420px]:text-[20px]"
                      >
                        {detail.location}
                      </p>
                    </div>
                    {detail.quote ? (
                      <p className="hidden max-w-[12rem] truncate vc-reading-serif text-[15px] leading-none text-[#1f4b45] min-[420px]:block">
                        “{detail.quote}”
                      </p>
                    ) : null}
                  </div>
                </div>
              </header>

              <DetailDivider />
              <DetailBlock icon="book" title={introTitle} lines={2} testId="mobile-codex-intro">
                {detail.intro}
              </DetailBlock>
              <DetailDivider />
              <DetailBlock icon="eye" title="我所见" scrollable testId="mobile-codex-observation">
                {detail.observation}
              </DetailBlock>
              <DetailDivider />
              <DetailBlock
                icon="heart"
                title={selectedSlot.type === "anomaly" ? "应对记录" : "关系印象"}
                lines={1}
                testId="mobile-codex-relationship"
              >
                {detail.relationship}
              </DetailBlock>
            </article>
          ) : null}
        </>
      )}
    </section>
  );
}
