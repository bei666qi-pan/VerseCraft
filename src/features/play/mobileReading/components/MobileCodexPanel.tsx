"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useGameStore } from "@/store/useGameStore";
import { languageText } from "@/lib/i18n/gameDisplay";
import { ALL_CODEX_CATALOG_SLOTS, type CodexCatalogSlot } from "../codexCatalog";
import {
  buildMobileCodexCardModels,
  buildMobileCodexDetail,
  filterMobileCodexSlotsByQuery,
  filterMobileCodexSlotsByType,
  formatMobileCodexFloorLabel,
  getMobileCodexIdentifiedCount,
  getMobileCodexSlotsForFloor,
  isMobileCodexSlotIdentified,
  resolveMobileCodexCurrentFloor,
  resolveMobileCodexInitialSelection,
  type MobileCodexCardModel,
  type MobileCodexFloorScope,
  type MobileCodexTypeFilter,
} from "../codexFormat";
import { resolveCodexPortrait } from "../codexPortraits";
import { MobileReadingIcons } from "../icons";
import type { MobileCodexPanelProps } from "../types";
import { CodexUnknownPortrait } from "./CodexUnknownPortrait";

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
      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-vc-paper-bright to-transparent" />
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
  const showUnknownPortrait = card.kind === "slot" && !card.identified;
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
      className={`relative h-[146px] w-[82px] shrink-0 overflow-visible rounded-[14px] border bg-vc-paper-bright text-left shadow-[0_6px_16px_rgba(73,63,51,0.09)] transition min-[420px]:h-[168px] min-[420px]:w-[92px] ${
        selected
          ? "border-vc-accent shadow-[0_10px_22px_rgba(47,116,106,0.14),0_0_0_2px_rgba(47,116,106,0.06)]"
          : "border-[#d8d1c6]"
      } ${card.disabled ? "opacity-75" : "active:scale-[0.985]"}`}
    >
      <div className="absolute inset-0 overflow-hidden rounded-[13px]">
        {portrait ? (
          <picture>
            {portrait.basePath ? (
              <>
                <source
                  type="image/avif"
                  srcSet={`${portrait.basePath}@1x.avif 1x, ${portrait.basePath}@2x.avif 2x, ${portrait.basePath}@3x.avif 3x`}
                />
                <source
                  type="image/webp"
                  srcSet={`${portrait.basePath}@1x.webp 1x, ${portrait.basePath}@2x.webp 2x, ${portrait.basePath}@3x.webp 3x`}
                />
              </>
            ) : null}
            <img
              src={portrait.src}
              alt={portrait.alt}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
              style={{ objectPosition: portrait.objectPosition ?? "center top" }}
            />
          </picture>
        ) : showUnknownPortrait ? (
          <CodexUnknownPortrait />
        ) : (
          <CodexSilhouette identified={card.identified} />
        )}
        <div className="absolute inset-x-0 bottom-0 h-[4.2rem] bg-gradient-to-t from-vc-paper-bright via-vc-paper-bright/92 to-transparent" />
      </div>
      <div className="absolute inset-x-1 bottom-3">
        <div className="vc-reading-serif truncate text-center text-[17px] font-semibold leading-tight text-[#174d46] min-[420px]:text-[19px]">
          {card.displayName}
        </div>
        <div className="vc-reading-serif mt-1 truncate text-center text-[12px] leading-tight text-vc-ink-soft min-[420px]:text-[14px]">
          {card.location}
        </div>
      </div>
      {card.kind === "slot" && card.unread ? (
        <span
          aria-hidden
          data-testid="mobile-codex-unread-dot"
          className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-vc-accent shadow-[0_0_6px_rgba(47,116,106,0.6)] ring-2 ring-vc-paper-bright"
        />
      ) : null}
      {selected ? (
        <span
          aria-hidden
          className="absolute -bottom-[7px] left-1/2 flex w-[58px] -translate-x-1/2 items-center justify-center"
        >
          <span className="h-px flex-1 bg-vc-accent" />
          <span className="mx-1 h-2.5 w-2.5 rounded-full bg-vc-accent shadow-[0_0_10px_rgba(47,116,106,0.38)]" />
          <span className="h-px flex-1 bg-vc-accent" />
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
  const contentRef = useRef<HTMLParagraphElement | null>(null);
  const [hasOverflow, setHasOverflow] = useState(false);

  useEffect(() => {
    if (!scrollable) {
      setHasOverflow(false);
      return;
    }
    const node = contentRef.current;
    if (!node) return;
    const update = () => {
      setHasOverflow(node.scrollHeight > node.clientHeight + 1);
    };
    update();
    if (typeof ResizeObserver === "undefined") {
      const tid = window.setTimeout(update, 0);
      return () => window.clearTimeout(tid);
    }
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [children, scrollable]);

  return (
    <section
      data-testid={testId}
      className={`relative min-h-0 pr-3 ${scrollable ? "flex flex-1 flex-col overflow-hidden" : "shrink-0"}`}
    >
      <h3 className="vc-reading-serif flex items-center gap-2 text-[20px] font-semibold leading-none text-[#174d46] min-[420px]:text-[24px]">
        <Icon className="h-5 w-5 shrink-0 text-vc-accent min-[420px]:h-6 min-[420px]:w-6" strokeWidth={1.45} />
        {title}
      </h3>
      <p
        ref={contentRef}
        className={
          scrollable
            ? "vc-reading-serif mt-1.5 min-h-0 flex-1 overflow-y-auto pr-1 text-[15px] leading-[1.48] text-[#1f4b45] min-[420px]:text-[17px]"
            : `vc-reading-serif mt-1.5 overflow-hidden text-[15px] leading-[1.42] text-[#1f4b45] [display:-webkit-box] [-webkit-box-orient:vertical] min-[420px]:text-[17px] ${clampClass}`
        }
      >
        {children}
      </p>
      {scrollable && hasOverflow ? (
        <div
          aria-hidden
          data-testid={testId ? `${testId}-scroll-indicator` : undefined}
          className="absolute bottom-0 right-0 top-4 flex w-2 flex-col items-center justify-between text-vc-accent"
        >
          <span className="text-[11px] leading-none">⌃</span>
          <span className="my-1 h-8 w-0.5 rounded-full bg-vc-accent min-[420px]:h-10" />
          <span className="text-[11px] leading-none">⌄</span>
        </div>
      ) : null}
    </section>
  );
}

function FilterPillGroup<T extends string>({
  value,
  options,
  disabled,
  onChange,
  testId,
}: {
  value: T;
  options: { value: T; label: string }[];
  disabled?: boolean;
  onChange: (next: T) => void;
  testId: string;
}) {
  return (
    <div
      data-testid={testId}
      className={`flex overflow-hidden rounded-full border border-[#d8d1c6] bg-vc-paper-bright/85 text-[12px] min-[420px]:text-[13px] ${
        disabled ? "opacity-45" : ""
      }`}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          disabled={disabled}
          aria-pressed={value === opt.value}
          data-testid={`${testId}-${opt.value}`}
          onClick={() => onChange(opt.value)}
          className={`px-2.5 py-1 transition min-[420px]:px-3 min-[420px]:py-1.5 ${
            value === opt.value ? "bg-vc-accent text-white" : "text-vc-ink-soft"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function MobileCodexPanel({
  codex,
  dynamicNpcStates,
  mainThreatByFloor,
  playerLocation,
  memorySpine,
  viewedCodexIds,
  onViewCodexEntry,
}: MobileCodexPanelProps) {
  const language = useGameStore((state) => state.language);
  const isEnglish = language === "en-US";
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

  const [typeFilter, setTypeFilter] = useState<MobileCodexTypeFilter>("all");
  const [floorScope, setFloorScope] = useState<MobileCodexFloorScope>("current");
  const [searchQuery, setSearchQuery] = useState("");
  const trimmedQuery = searchQuery.trim();
  // 搜索时自动扩大到全部楼层：玩家输入关键字时期望"帮我找到它"，而不是被当前楼层限制住。
  const effectiveFloorScope: MobileCodexFloorScope = trimmedQuery ? "all" : floorScope;
  const scopedSlots = effectiveFloorScope === "all" ? ALL_CODEX_CATALOG_SLOTS : floorSlots;
  const visibleSlots = useMemo(
    () => filterMobileCodexSlotsByQuery(filterMobileCodexSlotsByType(scopedSlots, typeFilter), codex, trimmedQuery, language),
    [scopedSlots, typeFilter, codex, trimmedQuery, language]
  );

  const identifiedCount = getMobileCodexIdentifiedCount(codex, visibleSlots);
  const globalIdentifiedCount = useMemo(() => getMobileCodexIdentifiedCount(codex, ALL_CODEX_CATALOG_SLOTS), [codex]);
  const cards = useMemo(
    () => buildMobileCodexCardModels(codex, visibleSlots, { dynamicNpcStates, viewedCodexIds }, language),
    [codex, dynamicNpcStates, visibleSlots, viewedCodexIds, language]
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const next = resolveMobileCodexInitialSelection(codex, visibleSlots);
    setSelectedId((current) => {
      if (current && visibleSlots.some((slot) => slot.id === current)) return current;
      return next;
    });
  }, [codex, visibleSlots]);

  const selectedSlot = visibleSlots.find((slot) => slot.id === selectedId) ?? visibleSlots[0] ?? null;
  const selectedIndex = selectedSlot ? Math.max(0, visibleSlots.findIndex((slot) => slot.id === selectedSlot.id)) : 0;
  const progressWidth =
    visibleSlots.length > 0 ? Math.max(18, ((selectedIndex + 1) / visibleSlots.length) * 100) : 0;
  const detail = selectedSlot ? buildMobileCodexDetail(codex, selectedSlot, { dynamicNpcStates, memorySpine }, language) : null;
  const introTitle = selectedSlot?.type === "anomaly" ? languageText(language, "异常简介", "Anomaly") : languageText(language, "人物简介", "Profile");

  // 打开详情即视为"已查看"：清除该条目在卡片带与底部导航上的"新发现"角标。
  useEffect(() => {
    if (!selectedSlot) return;
    if (!isMobileCodexSlotIdentified(codex, selectedSlot.id)) return;
    onViewCodexEntry?.(selectedSlot.id);
  }, [selectedSlot, codex, onViewCodexEntry]);

  const scopeLabel = trimmedQuery
    ? languageText(language, "搜索结果", "Search results")
    : effectiveFloorScope === "all"
      ? languageText(language, "全部楼层", "All floors")
      : isEnglish ? floorLabel : `${floorLabel}${floorLabel.endsWith("F") ? "" : "层"}`;
  const typeLabel = typeFilter === "npc" ? languageText(language, "人物", "people") : typeFilter === "anomaly" ? languageText(language, "异常", "anomalies") : languageText(language, "条目", "entries");
  const countLine = trimmedQuery
    ? isEnglish ? `Results: ${visibleSlots.length} found` : `搜索结果：命中 ${visibleSlots.length} 条`
    : isEnglish ? `${scopeLabel} identified ${typeLabel}: ${identifiedCount} / ${visibleSlots.length}` : `${scopeLabel}已识别${typeLabel}：${identifiedCount} / ${visibleSlots.length}`;

  return (
    <section
      data-testid="mobile-codex-panel"
      aria-label={languageText(language, "图鉴", "Codex")}
      className="box-border flex h-full min-h-0 flex-col overflow-hidden bg-[#fbf8f2] px-4 pb-[calc(var(--vc-mobile-bottom-nav-height)+0.75rem+env(safe-area-inset-bottom))] pt-[max(0.65rem,env(safe-area-inset-top))] text-[#174d46] min-[420px]:px-5 min-[420px]:pt-[max(0.85rem,env(safe-area-inset-top))]"
    >
      <div className="flex shrink-0 items-baseline justify-between gap-2 px-1">
        <span
          data-testid="mobile-codex-count"
          className="vc-reading-serif truncate text-[18px] font-semibold leading-none min-[420px]:text-[22px]"
        >
          {countLine}
        </span>
        <span
          data-testid="mobile-codex-global-count"
          className="vc-reading-serif shrink-0 text-[13px] leading-none text-vc-ink-soft min-[420px]:text-[15px]"
        >
          {isEnglish ? `Collection ${globalIdentifiedCount} / ${ALL_CODEX_CATALOG_SLOTS.length}` : `总收藏 ${globalIdentifiedCount} / ${ALL_CODEX_CATALOG_SLOTS.length}`}
        </span>
      </div>

      <div className="mt-2.5 flex shrink-0 flex-wrap items-center gap-1.5 px-1">
        <FilterPillGroup
          testId="mobile-codex-floor-scope"
          value={effectiveFloorScope}
          disabled={Boolean(trimmedQuery)}
          onChange={setFloorScope}
          options={[
            { value: "current", label: isEnglish ? `This floor ${floorLabel}` : `本层 ${floorLabel}` },
            { value: "all", label: languageText(language, "全部楼层", "All floors") },
          ]}
        />
        <FilterPillGroup
          testId="mobile-codex-type-filter"
          value={typeFilter}
          onChange={setTypeFilter}
          options={[
            { value: "all", label: languageText(language, "全部", "All") },
            { value: "npc", label: languageText(language, "人物", "People") },
            { value: "anomaly", label: languageText(language, "异常", "Anomalies") },
          ]}
        />
      </div>

      <div className="relative mt-2 shrink-0 px-1">
        <input
          type="text"
          inputMode="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={languageText(language, "搜索已识别人物 / 异常（跨全部楼层）", "Search identified people / anomalies")}
          aria-label={languageText(language, "搜索图鉴", "Search codex")}
          data-testid="mobile-codex-search-input"
          className="w-full rounded-full border border-[#d8d1c6] bg-vc-paper-bright/90 py-1.5 pl-3.5 pr-8 text-[13px] text-[#174d46] placeholder:text-vc-ink-soft/70 focus:border-vc-accent focus:outline-none min-[420px]:text-[14px]"
        />
        {trimmedQuery ? (
          <button
            type="button"
            aria-label={languageText(language, "清除搜索", "Clear search")}
            data-testid="mobile-codex-search-clear"
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[15px] leading-none text-vc-ink-soft"
          >
            ×
          </button>
        ) : null}
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

      {visibleSlots.length === 0 ? (
        <div
          data-testid="mobile-codex-empty"
          className="vc-reading-serif mt-5 rounded-[18px] border border-[#d8d1c6] bg-vc-paper-bright/92 px-5 py-10 text-center text-[20px] text-vc-ink-soft shadow-[0_8px_18px_rgba(73,63,51,0.08)]"
        >
          {trimmedQuery ? languageText(language, "没有找到匹配的已识别条目", "No matching identified entries") : languageText(language, "当前条件下暂无可记录对象", "No entries under these filters")}
        </div>
      ) : (
        <>
          <div className="mx-auto mb-3 flex h-1.5 w-32 shrink-0 overflow-hidden rounded-full bg-[#e3ded6]" aria-hidden>
            <span
              className="rounded-full bg-vc-accent shadow-[0_0_10px_rgba(47,116,106,0.24)]"
              style={{ width: `${progressWidth}%` }}
            />
          </div>

          {detail && selectedSlot ? (
            <article
              data-testid="mobile-codex-detail-panel"
              className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[18px] border border-[#d8d1c6] bg-vc-paper-bright/94 px-4 py-4 shadow-[0_8px_18px_rgba(73,63,51,0.08),inset_0_1px_0_rgba(255,255,255,0.95)] min-[420px]:px-5 min-[420px]:py-5"
            >
              <header className="grid shrink-0 grid-cols-[1.9rem_minmax(0,1fr)] gap-2.5">
                <MobileReadingIcons.BrandMark className="mt-0.5 h-7 w-7 text-vc-accent" strokeWidth={1.5} />
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
                        className="vc-reading-serif mt-1 truncate text-[17px] leading-none text-vc-ink-soft min-[420px]:text-[20px]"
                      >
                        {detail.location}
                      </p>
                      {detail.dangerLabel ? (
                        <p
                          data-testid="mobile-codex-detail-danger"
                          className="vc-reading-serif mt-1.5 inline-block rounded-full bg-[#174d46]/8 px-2.5 py-0.5 text-[13px] leading-tight text-[#174d46] min-[420px]:text-[14px]"
                        >
                          {detail.dangerLabel}
                        </p>
                      ) : null}
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
              <DetailBlock icon="eye" title={languageText(language, "我所见", "Observations")} scrollable testId="mobile-codex-observation">
                {detail.observation}
              </DetailBlock>
              <DetailDivider />
              <DetailBlock
                icon="heart"
                title={selectedSlot.type === "anomaly" ? languageText(language, "应对记录", "Response record") : languageText(language, "关系印象", "Relationship")}
                lines={1}
                testId="mobile-codex-relationship"
              >
                {detail.relationship}
              </DetailBlock>
              {detail.memories ? (
                <>
                  <DetailDivider />
                  <DetailBlock icon="book" title={languageText(language, "记忆片段", "Memory fragments")} lines={3} scrollable testId="mobile-codex-memories">
                    {detail.memories}
                  </DetailBlock>
                </>
              ) : null}
            </article>
          ) : null}
        </>
      )}
    </section>
  );
}
