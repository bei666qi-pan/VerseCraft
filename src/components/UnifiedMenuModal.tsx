"use client";

import { Activity, useCallback, useEffect, useRef, useState } from "react";
import { Settings, BookOpen, Volume2, VolumeX } from "lucide-react";
import type { StatType } from "@/lib/registry/types";
import { useGameStore, type ActiveMenu, type CodexEntry, type GameTask } from "@/store/useGameStore";
import { formatLocationLabel } from "@/lib/ui/locationLabels";
import { buildCodexIntro, computeRelationshipLabel, resolveCodexDisplayName } from "@/lib/registry/codexDisplay";
import type { ProfessionStateV1 } from "@/lib/profession/types";
import { buildProfessionApproachSnapshots, buildProfessionIdentityDigest } from "@/lib/profession/progressionUi";
import {
  evaluateProfessionActiveReadiness,
  getProfessionActiveSummary,
  getProfessionActiveSkillName,
  getProfessionPassiveSummary,
} from "@/lib/profession/benefits";

const STAT_ORDER: StatType[] = ["sanity", "agility", "luck", "charm", "background"];
const FALLBACK_STATS: Record<StatType, number> = {
  sanity: 0,
  agility: 0,
  luck: 0,
  charm: 0,
  background: 0,
};
const STAT_LABELS: Record<StatType, string> = {
  sanity: "精神",
  agility: "敏捷",
  luck: "幸运",
  charm: "魅力",
  background: "出身",
};
const STAT_MAX = 50;

type VisibleMenuTab = "settings" | "codex";

export const VISIBLE_MENU_TABS: readonly VisibleMenuTab[] = ["settings", "codex"];

const MENU_TABS: { id: VisibleMenuTab; label: string }[] = [
  { id: "settings", label: "设置" },
  { id: "codex", label: "图鉴" },
];

const TAB_ICONS: Record<VisibleMenuTab, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  settings: Settings,
  codex: BookOpen,
};

const TAB_ONBOARDING_ATTR: Record<VisibleMenuTab, string> = {
  settings: "settings-tab",
  codex: "codex-tab",
};

function isVisibleMenuTab(menu: ActiveMenu): menu is VisibleMenuTab {
  return menu === "settings" || menu === "codex";
}

interface UnifiedMenuModalProps {
  activeMenu: ActiveMenu;
  onClose: () => void;
  audioMuted: boolean;
  onToggleMute: () => void;
  /** 打开外层退出确认浮窗；仅负责触发，不在设置面板里直接执行结算或跳转。 */
  onRequestExit: () => void;
  /** Called when user views the remaining visible onboarding tab. */
  onViewedTab?: (tab: "codex") => void;
}

const RAPID_CLICK_WINDOW_MS = 600;
const RAPID_CLICK_THRESHOLD = 3;
const HOLD_DELAY_MS = 350;
const REPEAT_INTERVAL_MS = 120;
const ACCEL_INTERVAL_MS = 50;

function useUpgradeStepper(
  onUpgradeAttr: (attr: StatType) => void,
  canUpgrade: (attr: StatType) => boolean
) {
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeatTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const clickTimes = useRef<number[]>([]);
  const isRapid = useRef(false);
  const canUpgradeRef = useRef(canUpgrade);
  canUpgradeRef.current = canUpgrade;

  const clearTimers = useCallback(() => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    if (repeatTimer.current) {
      clearInterval(repeatTimer.current);
      repeatTimer.current = null;
    }
  }, []);

  const startHoldRepeat = useCallback(
    (attr: StatType) => {
      let stepCount = 0;
      const doStep = () => {
        if (!canUpgradeRef.current(attr)) {
          clearTimers();
          return;
        }
        onUpgradeAttr(attr);
        stepCount++;
      };
      const initialInterval = isRapid.current ? ACCEL_INTERVAL_MS : REPEAT_INTERVAL_MS;
      let intervalMs = initialInterval;
      const tick = () => {
        doStep();
        if (stepCount >= 4 && intervalMs !== ACCEL_INTERVAL_MS) {
          if (repeatTimer.current) clearInterval(repeatTimer.current);
          intervalMs = ACCEL_INTERVAL_MS;
          repeatTimer.current = setInterval(tick, intervalMs);
        }
      };
      repeatTimer.current = setInterval(tick, intervalMs);
    },
    [onUpgradeAttr, clearTimers]
  );

  const handlePointerDown = useCallback(
    (attr: StatType) => {
      clearTimers();
      const now = Date.now();
      clickTimes.current = clickTimes.current.filter((t) => now - t < RAPID_CLICK_WINDOW_MS);
      clickTimes.current.push(now);
      isRapid.current = clickTimes.current.length >= RAPID_CLICK_THRESHOLD;
      if (!canUpgradeRef.current(attr)) return;
      onUpgradeAttr(attr);
      holdTimer.current = setTimeout(() => {
        holdTimer.current = null;
        startHoldRepeat(attr);
      }, HOLD_DELAY_MS);
    },
    [onUpgradeAttr, clearTimers, startHoldRepeat]
  );

  const handlePointerUp = useCallback(() => {
    clearTimers();
  }, [clearTimers]);

  return { handlePointerDown, handlePointerUp };
}

function StatBar({
  statName,
  value,
  displayMax,
  isDanger,
  canUpgrade,
  onUpgradePointerDown,
  onUpgradePointerUp,
}: {
  statName: string;
  value: number;
  displayMax: number;
  isDanger: boolean;
  canUpgrade: boolean;
  onUpgradePointerDown: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onUpgradePointerUp: () => void;
}) {
  const cap = Math.max(1, displayMax);
  const pct = (value / cap) * 100;
  const fillGradient = isDanger ? "from-red-600 to-red-500" : "from-indigo-500 to-blue-400";
  return (
    <div className="mb-4">
      <div className="mb-1 flex justify-between">
        <span className={`text-sm font-medium ${isDanger ? "text-red-400" : "text-slate-300"}`}>{statName}</span>
        <span className="text-xs font-mono text-slate-500">{value} / {cap}</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-1.5 w-full rounded-full overflow-hidden bg-slate-800/50">
          <div className={`h-full bg-gradient-to-r ${fillGradient} transition-all`} style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
        <button
          type="button"
          onPointerDown={onUpgradePointerDown}
          onPointerUp={onUpgradePointerUp}
          onPointerLeave={onUpgradePointerUp}
          disabled={!canUpgrade}
          aria-label={`提升${statName}`}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-slate-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-35"
        >
          +
        </button>
      </div>
    </div>
  );
}

function SettingsPanel({
  stats,
  historicalMaxSanity,
  originium,
  onUpgradeAttr,
  playerLocation,
  time,
  volume,
  setVolume,
  audioMuted,
  onToggleMute,
  onRequestExit,
  professionState,
  onRefreshProfessionState,
  onActivateProfessionActive,
  mainThreatByFloor,
  codex,
  tasks,
}: {
  stats: Record<StatType, number>;
  historicalMaxSanity: number;
  originium: number;
  onUpgradeAttr: (attr: StatType) => void;
  playerLocation: string;
  time: { day: number; hour: number };
  volume: number;
  setVolume: (v: number) => void;
  audioMuted: boolean;
  onToggleMute: () => void;
  onRequestExit: () => void;
  professionState: ProfessionStateV1;
  onRefreshProfessionState: () => void;
  onActivateProfessionActive: () => { ok: boolean; reason?: string; tip?: string };
  mainThreatByFloor: ReturnType<typeof useGameStore.getState>["mainThreatByFloor"];
  codex: Record<string, CodexEntry>;
  tasks: GameTask[];
}) {
  const displayLocation = formatLocationLabel(playerLocation);
  const day = time.day ?? 0;
  const hour = time.hour ?? 0;
  const rowClass = "rounded-xl border border-white/10 bg-white/5 px-4 py-3";
  const labelClass = "text-xs text-slate-500";
  const valueClass = "mt-1 font-semibold text-cyan-300 drop-shadow-[0_0_8px_rgba(34,211,238,0.4)]";
  const totalPoints =
    (stats.sanity ?? 0) + (stats.agility ?? 0) + (stats.luck ?? 0) +
    (stats.charm ?? 0) + (stats.background ?? 0);
  const costPerPoint = totalPoints < 20 ? 2 : 3;
  const canUpgrade = (attr: StatType) => {
    const cur = stats[attr] ?? 0;
    if (cur >= 50) return false;
    return originium >= costPerPoint;
  };
  const stepper = useUpgradeStepper(onUpgradeAttr, canUpgrade);
  const readiness = evaluateProfessionActiveReadiness(professionState.currentProfession, {
    location: playerLocation,
    hasHotThreat: Object.values(mainThreatByFloor ?? {}).some((x) => x.phase === "active" || x.phase === "suppressed" || x.phase === "breached"),
    activeTasksCount: (tasks ?? []).filter((t) => t.status === "active" || t.status === "available").length,
    relationshipUpdatable: Object.values(codex ?? {}).some((x) => x.type === "npc"),
    hasAnomalyCodex: Object.values(codex ?? {}).some((x) => x.type === "anomaly"),
  });
  return (
    <div className="space-y-6 sm:space-y-8 p-4 sm:p-6 overflow-y-auto max-h-[calc(100dvh-120px)]">
      <div>
        <div className="mb-3 sm:mb-4 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold uppercase tracking-widest text-slate-400">叙事维度与坐标</h3>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs">
            <div className="h-2.5 w-2.5 rounded-full bg-gradient-to-br from-amber-300 to-orange-500" />
            <span className="font-bold tabular-nums text-amber-300">{originium}</span>
            <span className="text-amber-400/80">原石</span>
          </div>
        </div>
        <div className="flex flex-col gap-4 sm:gap-6">
          <div className="min-w-0 space-y-2">
            {STAT_ORDER.map((k) => (
              <StatBar
                key={k}
                statName={STAT_LABELS[k]}
                value={stats[k] ?? 0}
                displayMax={k === "sanity" ? historicalMaxSanity : STAT_MAX}
                isDanger={k === "sanity" && (stats[k] ?? 0) <= 3}
                canUpgrade={canUpgrade(k)}
                onUpgradePointerDown={(e) => {
                  e.currentTarget.releasePointerCapture(e.pointerId);
                  stepper.handlePointerDown(k);
                }}
                onUpgradePointerUp={stepper.handlePointerUp}
              />
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-row gap-3 sm:gap-4">
          <div className={`${rowClass} flex-1 min-w-0`}>
            <span className={labelClass}>当前位置</span>
            <p className={`${valueClass} break-words`}>{displayLocation}</p>
          </div>
          <div className={`${rowClass} flex-1 min-w-0`}>
            <span className={labelClass}>时间</span>
            <p className={valueClass}>{day} 日 {hour} 时</p>
          </div>
        </div>
      </div>

      <div className="pt-2">
        <div className="mb-4 rounded-xl border border-white/15 bg-white/5 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs text-slate-300">职业</p>
            <button
              type="button"
              onClick={onRefreshProfessionState}
              className="rounded-lg border border-slate-300/30 bg-white/10 px-2 py-1 text-[11px] text-slate-200"
              title="同步本地职业资格（不影响剧情）"
            >
              刷新
            </button>
          </div>

          {!professionState.currentProfession ? (
            <>
              <p className="text-[11px] leading-relaxed text-slate-400">你还没有正式职业，但你的玩法已经在“显露倾向”。</p>
              {(() => {
                const top = buildProfessionApproachSnapshots(professionState)[0];
                if (!top) return null;
                const next = top.next.length > 0 ? top.next.slice(0, 2).join("；") : "";
                const why = top.why.length > 0 ? top.why.slice(0, 2).join("；") : "";
                return (
                  <div className="mt-2 rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-[10px] text-slate-300">
                    <div className="text-slate-200">更像：{top.profession}</div>
                    {why ? <div className="mt-1 text-slate-400">依据：{why}</div> : null}
                    {next ? <div className="mt-1 text-amber-200">还差：{next}</div> : null}
                    <div className="mt-1 text-slate-500">{buildProfessionIdentityDigest(professionState)}</div>
                  </div>
                );
              })()}
            </>
          ) : (
            <>
              <p className="mb-2 text-[11px] text-slate-400">
                当前职业：{professionState.currentProfession}
              </p>
              <div className="mb-2 rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-[10px] text-slate-300">
                <div>被动：{getProfessionPassiveSummary(professionState.currentProfession)}</div>
                <div className="mt-1">主动：{getProfessionActiveSummary(professionState.currentProfession)}</div>
                <div className="mt-1 text-amber-200">当前场景命中率：{readiness.hitRate}%</div>
                <div className="mt-1 text-slate-400">{readiness.hint}</div>
                <button
                  type="button"
                  onClick={() => {
                    const res = onActivateProfessionActive();
                    if (!res.ok) {
                      window.alert(res.reason ?? "当前无法使用该技能。");
                      return;
                    }
                    if (res.tip) window.alert(`${getProfessionActiveSkillName(professionState.currentProfession)} 已就绪。\n${res.tip}`);
                  }}
                  className="mt-2 rounded border border-slate-300/30 bg-white/10 px-2 py-1 text-[10px] text-slate-100 hover:bg-white/15"
                >
                  {getProfessionActiveSkillName(professionState.currentProfession)}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div>
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={100}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              disabled={audioMuted}
              className="h-3 min-h-[24px] w-full min-w-0 flex-1 appearance-none rounded-full bg-slate-700 disabled:opacity-50 touch-manipulation [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-indigo-400 [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(99,102,241,0.6)]"
            />
            <span className="w-10 text-right font-mono text-sm text-slate-400">{volume}</span>
            <button
              type="button"
              onClick={onToggleMute}
              aria-label={audioMuted ? "开启声音" : "静音"}
              className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border backdrop-blur-xl transition-all duration-200 hover:scale-105 active:scale-95 touch-manipulation ${
                audioMuted
                  ? "border-amber-500/40 bg-amber-500/15 text-amber-300"
                  : "border-white/20 bg-white/10 text-slate-100"
              }`}
            >
              {audioMuted ? (
                <VolumeX size={16} strokeWidth={2} />
              ) : (
                <Volume2 size={16} strokeWidth={2} />
              )}
            </button>
            <button
              type="button"
              onClick={onRequestExit}
              className="inline-flex h-9 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 px-3 text-xs font-semibold text-slate-100 backdrop-blur-xl transition-all duration-200 hover:scale-105 hover:bg-white/15 active:scale-95 touch-manipulation"
            >
              退出
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CodexPanel({
  codex,
  selectedId,
  onSelect,
  page,
  onPageChange,
}: {
  codex: Record<string, CodexEntry>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  page: number;
  onPageChange: (p: number) => void;
}) {
  const allEntries = [
    ...Object.values(codex).filter((e) => e.type === "npc"),
    ...Object.values(codex).filter((e) => e.type === "anomaly"),
  ];
  const PAGE_SIZE = 6;
  const totalPages = Math.max(1, Math.ceil(allEntries.length / PAGE_SIZE));
  const pageEntries = allEntries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const selectedEntry = selectedId ? codex[selectedId] : null;

  return (
    <div className="flex h-full flex-row overflow-hidden">
      <div className="flex w-2/5 flex-col border-r border-white/10">
        <h3 className="border-b border-white/10 px-4 py-3 text-sm font-semibold tracking-widest text-slate-400">
          图鉴 · 目录
        </h3>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {pageEntries.length === 0 ? (
            <p className="py-4 text-xs text-slate-500">暂无</p>
          ) : (
            <div className="space-y-2">
              {pageEntries.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => onSelect(selectedId === e.id ? null : e.id)}
                  className={`w-full rounded-xl px-4 py-3 text-left text-sm transition ${
                    e.type === "anomaly"
                      ? selectedId === e.id
                        ? "bg-red-500/30 text-white"
                        : "bg-white/5 text-slate-300 hover:bg-red-500/10"
                      : selectedId === e.id
                        ? "bg-indigo-500/30 text-white"
                        : "bg-white/5 text-slate-300 hover:bg-indigo-500/10"
                  }`}
                >
                  {resolveCodexDisplayName(e)}
                </button>
              ))}
            </div>
          )}
          {allEntries.length > PAGE_SIZE && (
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => onPageChange(Math.max(0, page - 1))}
                disabled={page <= 0}
                className="rounded-lg bg-slate-700/80 px-3 py-1.5 text-xs text-white transition hover:bg-slate-700 disabled:opacity-40"
              >
                上一页
              </button>
              <button
                type="button"
                onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
                disabled={page >= totalPages - 1}
                className="rounded-lg bg-slate-700/80 px-3 py-1.5 text-xs text-white transition hover:bg-slate-700 disabled:opacity-40"
              >
                下一页
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-1 flex-col overflow-y-auto p-6">
        {selectedEntry ? (
          <>
            <h3 className="text-xl font-bold text-white">{resolveCodexDisplayName(selectedEntry)}</h3>
            <p className="mt-1 text-xs uppercase tracking-wider text-slate-500">
              {selectedEntry.type === "npc" ? "徘徊者" : "诡异"}
            </p>
            <div className="mt-6 space-y-4">
              <div>
                <span className="text-xs text-slate-500">关系</span>
                <p className="mt-1 text-sm font-semibold text-slate-200">{computeRelationshipLabel(selectedEntry)}</p>
              </div>
              {typeof selectedEntry.combatPower === "number" && (
                <div>
                  <span className="text-xs text-slate-500">剧情张力</span>
                  <p className="mt-1 font-semibold text-slate-200">{selectedEntry.combatPowerDisplay ?? selectedEntry.combatPower}</p>
                </div>
              )}
              <div>
                <span className="text-xs text-slate-500">简单介绍</span>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-300">
                  {buildCodexIntro(selectedEntry) || "暂无"}
                </p>
              </div>
              <div>
                <span className="text-xs text-slate-500">我目前掌握的信息</span>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-300">
                  {(selectedEntry.known_info ?? "").trim() || "暂无"}
                </p>
              </div>
              {selectedEntry.personality && (
                <div>
                  <span className="text-xs text-slate-500">性格</span>
                  <p className="mt-1 text-sm text-slate-300">{selectedEntry.personality}</p>
                </div>
              )}
              {selectedEntry.traits && (
                <div>
                  <span className="text-xs text-slate-500">特质</span>
                  <p className="mt-1 text-sm text-slate-300">{selectedEntry.traits}</p>
                </div>
              )}
              {selectedEntry.rules_discovered && (
                <div>
                  <span className="text-xs text-slate-500">已知规则</span>
                  <p className="mt-1 text-sm text-amber-300">{selectedEntry.rules_discovered}</p>
                </div>
              )}
              {selectedEntry.weakness && (
                <div>
                  <span className="text-xs text-slate-500">已知弱点</span>
                  <p className="mt-1 font-semibold text-amber-400 drop-shadow-[0_0_6px_rgba(245,158,11,0.5)]">
                    {selectedEntry.weakness}
                  </p>
                </div>
              )}
            </div>
          </>
        ) : (
          <p className="text-slate-500">选择左侧条目查看详情</p>
        )}
      </div>
    </div>
  );
}

export function UnifiedMenuModal({
  activeMenu,
  onClose,
  audioMuted,
  onToggleMute,
  onRequestExit,
  onViewedTab,
}: UnifiedMenuModalProps) {
  const [codexPage, setCodexPage] = useState(0);
  const [selectedCodexId, setSelectedCodexId] = useState<string | null>(null);

  const stats = useGameStore((s) => s.stats) ?? { ...FALLBACK_STATS };
  const historicalMaxSanity = useGameStore((s) => s.historicalMaxSanity ?? 50);
  const codex = useGameStore((s) => s.codex ?? {});
  const tasks = useGameStore((s) => s.tasks ?? []);
  const originium = useGameStore((s) => s.originium ?? 0);
  const upgradeAttribute = useGameStore((s) => s.upgradeAttribute);
  const playerLocation = useGameStore((s) => s.playerLocation ?? "B1_SafeZone");
  const time = useGameStore((s) => s.time ?? { day: 0, hour: 0 });
  const mainThreatByFloor = useGameStore((s) => s.mainThreatByFloor ?? {});
  const setHasCheckedCodex = useGameStore((s) => s.setHasCheckedCodex);
  const professionState = useGameStore((s) => s.professionState);
  const refreshProfessionState = useGameStore((s) => s.refreshProfessionState);
  const activateProfessionActive = useGameStore((s) => s.activateProfessionActive);

  const volume = useGameStore((s) => s.volume);
  const setVolume = useGameStore((s) => s.setVolume);

  useEffect(() => {
    if (activeMenu !== null && activeMenu !== "character" && !isVisibleMenuTab(activeMenu)) {
      useGameStore.getState().setActiveMenu(null);
    }
  }, [activeMenu]);

  const isOpen = isVisibleMenuTab(activeMenu);
  const currentTab: VisibleMenuTab = isOpen ? activeMenu : "settings";

  function handleRequestExit() {
    onClose();
    onRequestExit();
  }

  function handleTabSelect(id: VisibleMenuTab) {
    if (id === "codex") {
      setHasCheckedCodex(true);
      onViewedTab?.("codex");
    }
    useGameStore.getState().setActiveMenu(id);
  }

  return (
    <Activity mode={isOpen ? "visible" : "hidden"}>
      <div
        className="fixed inset-0 z-50 flex h-[100dvh] w-screen bg-black/70"
        role="dialog"
        aria-modal
        aria-labelledby="unified-menu-title"
        aria-hidden={!isOpen}
      >
        <div
          className="flex h-full w-full overflow-hidden border-t border-white/10 bg-slate-900/50 shadow-[0_0_60px_rgba(0,0,0,0.8)] backdrop-blur-2xl"
          id="unified-menu-content"
        >
          <aside className="flex w-20 min-w-[72px] sm:w-1/4 flex-col border-r border-white/10 bg-black/20 p-3 sm:p-4">
            <h2 id="unified-menu-title" className="sr-only">
              控制中枢
            </h2>
            <div className="flex flex-1 min-h-0 flex-col items-center gap-2 sm:gap-3 overflow-y-auto py-1">
              {MENU_TABS.map((tab) => {
                const isActive = currentTab === tab.id;
                const Icon = TAB_ICONS[tab.id];
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => handleTabSelect(tab.id)}
                    data-onboarding={TAB_ONBOARDING_ATTR[tab.id]}
                    className={`flex flex-col items-center justify-center gap-1 min-w-[52px] min-h-[48px] w-12 h-12 sm:min-w-[56px] sm:min-h-[56px] sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl transition-all duration-500 cursor-pointer touch-manipulation ${
                      isActive
                        ? "text-white bg-white/10 border border-white/20 shadow-[0_0_20px_rgba(255,255,255,0.15)] drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]"
                        : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
                    }`}
                  >
                    <Icon className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={1.5} />
                    <span className="text-[9px] sm:text-[10px] font-medium tracking-wide leading-tight">{tab.label}</span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="mt-auto min-h-[44px] rounded-xl border border-white/30 bg-white/15 px-5 py-3 text-sm font-semibold text-white shadow-[0_0_12px_rgba(255,255,255,0.15)] transition hover:bg-white/25 hover:border-white/50 hover:shadow-[0_0_20px_rgba(255,255,255,0.25)] touch-manipulation"
            >
              关闭
            </button>
          </aside>

          <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <Activity mode={currentTab === "settings" ? "visible" : "hidden"}>
              <SettingsPanel
                stats={stats}
                historicalMaxSanity={historicalMaxSanity}
                originium={originium}
                onUpgradeAttr={(attr) => upgradeAttribute(attr)}
                playerLocation={playerLocation}
                time={time}
                volume={volume}
                setVolume={setVolume}
                audioMuted={audioMuted}
                onToggleMute={onToggleMute}
                onRequestExit={handleRequestExit}
                professionState={professionState}
                onRefreshProfessionState={refreshProfessionState}
                onActivateProfessionActive={activateProfessionActive}
                mainThreatByFloor={mainThreatByFloor}
                codex={codex}
                tasks={tasks}
              />
            </Activity>
            <Activity mode={currentTab === "codex" ? "visible" : "hidden"}>
              <CodexPanel
                codex={codex}
                selectedId={selectedCodexId}
                onSelect={setSelectedCodexId}
                page={codexPage}
                onPageChange={setCodexPage}
              />
            </Activity>
          </main>
        </div>
      </div>
    </Activity>
  );
}
