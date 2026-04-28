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

function CodexSilhouette({ identified }: { identified: boolean }) {
  return (
    <div
      aria-hidden
      className={`absolute inset-0 overflow-hidden rounded-t-[16px] ${
        identified
          ? "bg-[radial-gradient(circle_at_50%_16%,rgba(47,116,106,0.18),transparent_22%),linear-gradient(160deg,#dce7e3,#f5f2ec)]"
          : "bg-[radial-gradient(circle_at_50%_24%,rgba(47,116,106,0.28)_0_16%,transparent_17%),linear-gradient(165deg,#f2efea,#fffdf8)]"
      }`}
    >
      <div
        className={`absolute left-1/2 top-[21%] h-[42%] w-[48%] -translate-x-1/2 rounded-full ${
          identified ? "bg-[#8fa79f]/50" : "bg-[#174d46]/78"
        }`}
      />
      <div
        className={`absolute bottom-0 left-1/2 h-[46%] w-[72%] -translate-x-1/2 rounded-t-full ${
          identified ? "bg-[#8fa79f]/45" : "bg-[#174d46]/76"
        }`}
      />
      <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#fffdf8] to-transparent" />
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
  const portrait = card.kind === "slot" && card.identified ? resolveCodexPortrait(card.id) : null;
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
      className={`relative h-[184px] w-[120px] shrink-0 overflow-visible rounded-[18px] border bg-[#fffdf8] text-left shadow-[0_8px_18px_rgba(73,63,51,0.09)] transition min-[420px]:h-[210px] min-[420px]:w-[132px] ${
        selected
          ? "border-[#2f746a] shadow-[0_10px_22px_rgba(47,116,106,0.18),0_0_0_2px_rgba(47,116,106,0.08)]"
          : "border-[#d8d1c6]"
      } ${card.disabled ? "opacity-75" : "active:scale-[0.985]"}`}
    >
      <div className="relative h-[116px] overflow-hidden rounded-t-[16px] border-b border-[#e3ded6] min-[420px]:h-[134px]">
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
      </div>
      <div className="px-3 pb-3 pt-3">
        <div className="vc-reading-serif truncate text-center text-[21px] font-semibold leading-tight text-[#174d46] min-[420px]:text-[24px]">
          {card.displayName}
        </div>
        <div className="vc-reading-serif mt-1 truncate text-center text-[16px] leading-tight text-[#4f706a] min-[420px]:text-[18px]">
          {card.location}
        </div>
      </div>
      {selected ? (
        <span
          aria-hidden
          className="absolute -bottom-2 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full bg-[#2f746a] shadow-[0_0_10px_rgba(47,116,106,0.45)]"
        />
      ) : null}
    </button>
  );
}

function DetailDivider() {
  return (
    <div className="my-5 flex items-center gap-2 text-[#8fa79f]" aria-hidden>
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
}: {
  icon: "book" | "eye" | "heart";
  title: string;
  children: string;
}) {
  const Icon =
    icon === "book"
      ? MobileReadingIcons.CodexBook
      : icon === "eye"
        ? MobileReadingIcons.CodexEye
        : MobileReadingIcons.CodexHeart;
  return (
    <section>
      <h3 className="vc-reading-serif flex items-center gap-3 text-[25px] font-semibold leading-none text-[#174d46] min-[420px]:text-[30px]">
        <Icon className="h-7 w-7 shrink-0 text-[#2f746a]" strokeWidth={1.45} />
        {title}
      </h3>
      <p className="vc-reading-serif mt-3 whitespace-pre-line text-[19px] leading-[1.8] text-[#1f4b45] min-[420px]:text-[22px]">
        {children}
      </p>
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
      className="box-border min-h-full px-5 pb-[calc(var(--vc-mobile-bottom-nav-height)+1.25rem+env(safe-area-inset-bottom))] pt-5 text-[#174d46]"
    >
      <div className="vc-reading-serif px-1 text-[22px] font-semibold leading-none min-[420px]:text-[26px]">
        <span data-testid="mobile-codex-count">
          {countPrefix}：{identifiedCount} / {floorSlots.length}
        </span>
      </div>

      <div
        data-testid="mobile-codex-card-strip"
        className="-mx-5 mt-4 flex gap-4 overflow-x-auto px-5 pb-6 pt-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
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
          <div className="mx-auto mb-6 flex h-1.5 w-36 overflow-hidden rounded-full bg-[#e3ded6]" aria-hidden>
            <span
              className="rounded-full bg-[#2f746a] shadow-[0_0_10px_rgba(47,116,106,0.28)]"
              style={{ width: `${progressWidth}%` }}
            />
          </div>

          {detail && selectedSlot ? (
            <article
              data-testid="mobile-codex-detail-panel"
              className="rounded-[18px] border border-[#d8d1c6] bg-[#fffdf8]/92 px-5 py-5 shadow-[0_10px_24px_rgba(73,63,51,0.1),inset_0_1px_0_rgba(255,255,255,0.95)]"
            >
              <header className="grid grid-cols-[2.2rem_minmax(0,1fr)] gap-3">
                <MobileReadingIcons.BrandMark className="mt-1 h-8 w-8 text-[#2f746a]" strokeWidth={1.5} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                    <div>
                      <h2
                        data-testid="mobile-codex-detail-name"
                        className="vc-reading-serif text-[32px] font-semibold leading-tight text-[#174d46] min-[420px]:text-[38px]"
                      >
                        {detail.name}
                      </h2>
                      <p
                        data-testid="mobile-codex-detail-location"
                        className="vc-reading-serif mt-1 text-[21px] leading-tight text-[#4f706a] min-[420px]:text-[24px]"
                      >
                        {detail.location}
                      </p>
                    </div>
                    {detail.quote ? (
                      <p className="vc-reading-serif max-w-[13rem] text-[17px] leading-relaxed text-[#1f4b45]">
                        “{detail.quote}”
                      </p>
                    ) : null}
                  </div>
                </div>
              </header>

              <DetailDivider />
              <DetailBlock icon="book" title={introTitle}>
                {detail.intro}
              </DetailBlock>
              <DetailDivider />
              <DetailBlock icon="eye" title="我所见">
                {detail.observation}
              </DetailBlock>
              <DetailDivider />
              <DetailBlock icon="heart" title={selectedSlot.type === "anomaly" ? "应对记录" : "关系印象"}>
                {detail.relationship}
              </DetailBlock>
            </article>
          ) : null}
        </>
      )}
    </section>
  );
}
