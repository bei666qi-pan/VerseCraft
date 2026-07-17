"use client";

import { memo, useMemo, useState } from "react";
import type { TurnDeltaDigest as DigestData, DeltaItem } from "@/features/play/turnCommit/buildTurnDeltaDigest";
import { useGameStore } from "@/store/useGameStore";
import type { GameLanguage } from "@/lib/i18n/language";

// ── 单维度行渲染 ──────────────────────────────────────────────

const RowIcon = memo(function RowIcon({ item }: { item: DeltaItem }) {
  switch (item.kind) {
    case "sanity":
      return <span className="opacity-60">◇</span>;
    case "time":
      return <span className="opacity-60">⊙</span>;
    case "currency":
      return <span className="opacity-60">◆</span>;
    case "acquired":
    case "warehouse_acquired":
      return <span className="opacity-60">+</span>;
    case "consumed":
      return <span className="opacity-60">−</span>;
    case "new":
      return <span className="opacity-60">◈</span>;
    case "status":
      return <span className="opacity-60">◎</span>;
    case "relation":
      return <span className="opacity-60">◇</span>;
    case "codex":
      return <span className="opacity-60">◈</span>;
    case "foreshadow_payoff":
      return <span className="text-[#d4a84b]">✦</span>;
    default:
      return null;
  }
});

function deltaItemLabel(item: DeltaItem, language: GameLanguage): string {
  const english = language === "en-US";
  switch (item.kind) {
    case "sanity":
      return `${english ? "Sanity" : "理智"} ${item.delta >= 0 ? "+" : ""}${item.delta}`;
    case "time":
      return english ? "Time passes" : "时间流逝";
    case "currency":
      return `${english ? "Originium" : "源石"} ${item.delta >= 0 ? "+" : ""}${item.delta}`;
    case "acquired":
      return `${english ? "Acquired" : "获得"}: ${item.label}`;
    case "warehouse_acquired":
      return `${english ? "Stored" : "收入仓库"}: ${item.label}`;
    case "consumed":
      return `${english ? "Used" : "消耗"}: ${item.label}`;
    case "new":
      return `${english ? "New clue" : "新线索"}: ${item.label}`;
    case "status":
      return item.label;
    case "relation":
      return `${english ? "Relationship" : "关系变化"}: ${item.label}`;
    case "codex":
      return `${english ? "Codex unlocked" : "图鉴解锁"}: ${item.label}`;
    case "foreshadow_payoff":
      return english ? "An earlier detail reveals its meaning" : "此前的某个细节，此刻显露了意义";
    default:
      return "";
  }
}

function deltaItemTone(item: DeltaItem): "positive" | "negative" | "neutral" {
  switch (item.kind) {
    case "sanity":
      return item.delta < 0 ? "negative" : "positive";
    case "currency":
      return item.delta > 0 ? "positive" : item.delta < 0 ? "negative" : "neutral";
    case "acquired":
    case "warehouse_acquired":
    case "new":
    case "codex":
      return "positive";
    case "consumed":
      return "negative";
    case "status":
      return item.label.includes("完成") ? "positive" : "negative";
    case "foreshadow_payoff":
      return "neutral";
    default:
      return "neutral";
  }
}

/** 伏笔回调可展开详情 */
const ForeshadowPayoffDetail = memo(function ForeshadowPayoffDetail({
  seedText,
}: {
  seedText: string;
}) {
  return (
    <div className="mt-1.5 rounded-[6px] border border-[#d7d1bd]/30 bg-white/60 px-2.5 py-1.5 text-[11px] leading-relaxed text-[#6b7a76]">
      {seedText}
    </div>
  );
});

// ── 主体组件 ──────────────────────────────────────────────────

export type TurnDeltaDigestProps = {
  data: DigestData | null;
};

export const TurnDeltaDigest = memo(function TurnDeltaDigest({
  data,
}: TurnDeltaDigestProps) {
  const language = useGameStore((state) => state.language);
  const [expandedPayoffId, setExpandedPayoffId] = useState<number | null>(null);

  const rows = useMemo(() => {
    if (!data || !data.hasChanges) return null;
    return data.items;
  }, [data]);

  if (!rows || rows.length === 0) return null;

  // 分离 foreshadow_payoff — 放在摘要末尾特殊处理
  const nonPayoffRows = rows.filter((r) => r.kind !== "foreshadow_payoff");
  const payoffRows = rows.filter((r) => r.kind === "foreshadow_payoff") as Extract<
    DeltaItem,
    { kind: "foreshadow_payoff" }
  >[];

  const hasPayoff = payoffRows.length > 0;
  const hasRegular = nonPayoffRows.length > 0;

  return (
    <div
      data-testid="turn-delta-digest"
      className="my-4 rounded-[8px] border border-[#d7d1bd]/30 bg-white/5 px-3 py-2.5 text-[12px] leading-relaxed backdrop-blur-xl shadow-[0_4px_16px_rgba(42,55,45,0.04)]"
    >
      {hasRegular ? (
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {nonPayoffRows.map((item, i) => {
            const tone = deltaItemTone(item);
            const toneCls =
              tone === "positive"
                ? "text-[#3c8a6e]"
                : tone === "negative"
                  ? "text-[#b5605a]"
                  : "text-[#6b7a76]";
            return (
              <span key={`${item.kind}-${i}`} className={`inline-flex items-center gap-1 ${toneCls}`}>
                <RowIcon item={item} />
                {deltaItemLabel(item, language)}
              </span>
            );
          })}
        </div>
      ) : null}

      {hasPayoff ? (
        <div className={hasRegular ? "mt-2 border-t border-[#d7d1bd]/20 pt-2" : ""}>
          {payoffRows.map((item, i) => {
            const idx = nonPayoffRows.length + i;
            const expanded = expandedPayoffId === idx;
            const text = item.seedText || "";
            return (
              <div key={`payoff-${i}`}>
                <button
                  type="button"
                  onClick={() => setExpandedPayoffId(expanded ? null : idx)}
                  className="inline-flex cursor-pointer items-center gap-1 text-[#d4a84b] transition-colors hover:text-[#e8c064] active:scale-[0.97]"
                  data-testid={`foreshadow-payoff-${i}`}
                >
                  <span>✦</span>
                  <span>{deltaItemLabel(item, language)}</span>
                  {text ? (
                    <span className="text-[10px] text-[#8b8a84]">{expanded ? "▲" : "▼"}</span>
                  ) : null}
                </button>
                {expanded && text ? (
                  <ForeshadowPayoffDetail seedText={text} />
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
});
