"use client";

import { useEffect, useMemo, useState } from "react";
import { type CodexCatalogSlot } from "../codexCatalog";
import {
  buildMobileCodexCardModels,
  buildMobileCodexDetail,
  formatMobileCodexFloorLabel,
  getMobileCodexSlotsForFloor,
  getMobileCodexIdentifiedCount,
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
      className={`absolute inset-0 overflow-hidden rounded-t-[10px] ${
        identified
          ? "bg-[radial-gradient(circle_at_50%_18%,rgba(234,161,93,0.16),transparent_22%),linear-gradient(150deg,rgba(37,53,61,0.88),rgba(4,15,23,0.96))]"
          : "bg-[radial-gradient(circle_at_50%_24%,rgba(15,31,42,0.9)_0_16%,transparent_17%),linear-gradient(165deg,rgba(8,23,34,0.96),rgba(3,12,19,0.98))]"
      }`}
    >
      <div
        className={`absolute left-1/2 top-[22%] h-[42%] w-[48%] -translate-x-1/2 rounded-full ${
          identified ? "bg-[#101b23]/80 shadow-[0_0_26px_rgba(239,177,127,0.1)]" : "bg-[#020b12]/95"
        }`}
      />
      <div
        className={`absolute bottom-0 left-1/2 h-[45%] w-[72%] -translate-x-1/2 rounded-t-full ${
          identified ? "bg-[#121f28]/78" : "bg-[#020b12]/95"
        }`}
      />
      <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#06131d] to-transparent" />
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
  const portrait = card.kind === "slot" ? resolveCodexPortrait(card.id) : null;
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
      className={`relative h-[176px] w-[118px] shrink-0 overflow-visible rounded-[12px] border bg-[#071722]/82 text-left transition ${
        selected
          ? "border-[#ffad58] shadow-[0_0_18px_rgba(255,168,83,0.38),inset_0_0_16px_rgba(255,168,83,0.06)]"
          : "border-[#b76032]/70 shadow-[inset_0_0_12px_rgba(255,170,90,0.03)]"
      } ${card.disabled ? "opacity-70" : "active:scale-[0.985]"}`}
    >
      <div className="relative h-[116px] overflow-hidden rounded-t-[10px] border-b border-[#9a5e3f]/45">
        {portrait ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={portrait.src}
            alt={portrait.alt}
            className="h-full w-full object-cover"
            style={{ objectPosition: portrait.objectPosition ?? "center" }}
          />
        ) : (
          <CodexSilhouette identified={card.identified} />
        )}
      </div>
      <div className="px-3 pb-3 pt-2">
        <div className="vc-reading-serif truncate text-center text-[22px] font-semibold leading-tight text-[#ffad58]">
          {card.displayName}
        </div>
        <div className="vc-reading-serif mt-1 truncate text-center text-[16px] leading-tight text-[#d99c68]">
          {card.location}
        </div>
      </div>
      {selected ? (
        <span
          aria-hidden
          className="absolute -bottom-2 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full bg-[#ffd18a] shadow-[0_0_13px_rgba(255,202,128,0.75)]"
        />
      ) : null}
    </button>
  );
}

function DetailDivider() {
  return (
    <div className="my-5 flex items-center gap-2 text-[#d98545]/80" aria-hidden>
      <span className="h-px flex-1 bg-[#8b593d]/55" />
      <span className="text-[18px] leading-none">✧</span>
      <span className="h-px flex-1 bg-[#8b593d]/55" />
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
      <h3 className="vc-reading-serif flex items-center gap-3 text-[25px] font-semibold leading-none text-[#ffad58]">
        <Icon className="h-7 w-7 shrink-0 text-[#f4a65a]" strokeWidth={1.45} />
        {title}
      </h3>
      <p className="vc-reading-serif mt-4 whitespace-pre-line text-[20px] leading-[1.8] text-[#f2a75d]">
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
    floorSlots.length > 0 ? Math.max(25, ((selectedIndex + 1) / floorSlots.length) * 100) : 0;
  const detail = selectedSlot ? buildMobileCodexDetail(codex, selectedSlot, { dynamicNpcStates }) : null;
  const introTitle = selectedSlot?.type === "anomaly" ? "异常简介" : "人物简介";

  return (
    <section
      data-testid="mobile-codex-panel"
      aria-label="图鉴"
      className="px-4 pb-[calc(var(--vc-mobile-bottom-nav-height)+2rem+env(safe-area-inset-bottom))] pt-5 text-[#f1ad62]"
    >
      <div className="vc-reading-serif px-1 text-[24px] font-semibold leading-none text-[#ff9850] drop-shadow-[0_0_10px_rgba(255,153,78,0.22)]">
        <span data-testid="mobile-codex-count">
          {floorLabel} 图鉴：{identifiedCount} / {floorSlots.length}
        </span>
      </div>

      <div
        data-testid="mobile-codex-card-strip"
        className="-mx-4 mt-5 flex gap-4 overflow-x-auto px-4 pb-5 pt-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
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
          className="vc-reading-serif mt-4 rounded-[14px] border border-[#9a5e3f]/70 bg-[#071722]/72 px-5 py-8 text-center text-[20px] text-[#d99c68]"
        >
          当前楼层暂无可记录对象
        </div>
      ) : (
        <>
          <div className="mx-auto mb-5 flex h-1.5 w-36 overflow-hidden rounded-full bg-[#31404a]/60" aria-hidden>
            <span
              className="rounded-full bg-[#ff9850] shadow-[0_0_10px_rgba(255,152,80,0.55)]"
              style={{ width: `${progressWidth}%` }}
            />
          </div>

          {detail && selectedSlot ? (
            <article
              data-testid="mobile-codex-detail-panel"
              className="rounded-[14px] border border-[#cc6f36]/90 bg-[#071722]/72 px-5 py-5 shadow-[inset_0_0_28px_rgba(255,156,83,0.04),0_0_22px_rgba(0,0,0,0.22)]"
            >
              <header className="grid grid-cols-[2.2rem_minmax(0,1fr)] gap-3">
                <MobileReadingIcons.BrandMark className="mt-1 h-8 w-8 text-[#f29d51]" strokeWidth={1.5} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                    <div>
                      <h2
                        data-testid="mobile-codex-detail-name"
                        className="vc-reading-serif text-[32px] font-semibold leading-tight text-[#ffad58]"
                      >
                        {detail.name}
                      </h2>
                      <p
                        data-testid="mobile-codex-detail-location"
                        className="vc-reading-serif mt-1 text-[22px] leading-tight text-[#d99c68]"
                      >
                        {detail.location}
                      </p>
                    </div>
                    {detail.quote ? (
                      <p className="vc-reading-serif max-w-[13rem] text-[17px] leading-relaxed text-[#ffad58]">
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
