"use client";

import { Activity, useCallback, useEffect, useRef, useState } from "react";
import { Settings, Package, BookOpen, Warehouse, Trophy, Volume2, VolumeX } from "lucide-react";
import type { Item, StatType, WarehouseItem, Weapon } from "@/lib/registry/types";
import { canUseItem, formatStatRequirements, getItemEffectSummary } from "@/lib/registry/itemUtils";
import { useGameStore, type ActiveMenu, type CodexEntry, type GameTask } from "@/store/useGameStore";
import { buildCodexIntro, computeRelationshipLabel, resolveCodexDisplayName } from "@/lib/registry/codexDisplay";
import {
  formatTaskRewardSummary,
  getRewardCurveHintByFloorTier,
  getTaskStatusLabel,
} from "@/lib/tasks/taskV2";
import {
  useAchievementsStore,
  type AchievementRecord,
  type AchievementGrade,
} from "@/store/useAchievementsStore";
import type { ProfessionId, ProfessionStateV1 } from "@/lib/profession/types";
import { PROFESSION_IDS } from "@/lib/profession/registry";
import {
  evaluateProfessionActiveReadiness,
  getProfessionActiveSummary,
  getProfessionActiveSkillName,
  getProfessionPassiveSummary,
} from "@/lib/profession/benefits";
import { WeaponSlotPanel } from "@/components/WeaponSlotPanel";

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

const FLOOR_LABELS: Record<string, string> = {
  B2: "地下二层",
  B1: "地下一层",
  "1": "一楼",
  "2": "二楼",
  "3": "三楼",
  "4": "四楼",
  "5": "五楼",
  "6": "六楼",
  "7": "七楼",
};

const LOCATION_LABELS: Record<string, string> = {
  B2_Passage: "地下二层通道",
  B2_GatekeeperDomain: "地下二层守门领域",
  B1_SafeZone: "地下一层安全区",
  B1_Storage: "地下一层储物间",
  B1_Laundry: "地下一层洗衣房",
  B1_PowerRoom: "地下一层配电间",
  "1F_Lobby": "一楼门厅",
  "1F_PropertyOffice": "一楼物业办公室",
  "1F_GuardRoom": "一楼保安室",
  "1F_Mailboxes": "一楼信箱区",
  "2F_Clinic201": "二楼 201 诊室",
  "2F_Room202": "二楼 202 室",
  "2F_Room203": "二楼 203 室",
  "2F_Corridor": "二楼走廊",
  "3F_Room301": "三楼 301 室",
  "3F_Room302": "三楼 302 室",
  "3F_Stairwell": "三楼楼梯间",
  "4F_Room401": "四楼 401 室",
  "4F_Room402": "四楼 402 室",
  "4F_CorridorEnd": "四楼走廊尽头",
  "5F_Room501": "五楼 501 室",
  "5F_Room502": "五楼 502 室",
  "5F_Studio503": "五楼 503 画室",
  "6F_Room601": "六楼 601 室",
  "6F_Room602": "六楼 602 室",
  "6F_Stairwell": "六楼楼梯间",
  "7F_Room701": "七楼 701 室",
  "7F_Bench": "七楼长椅区",
  "7F_Kitchen": "七楼厨房",
  "7F_SealedDoor": "七楼封闭门区",
};

function formatLocationLabel(location: string): string {
  if (!location) return "未知区域";
  const mapped = LOCATION_LABELS[location];
  if (mapped) return mapped;
  return "未知区域";
}

const TAB_ICONS: Record<NonNullable<ActiveMenu>, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  settings: Settings,
  backpack: Package,
  codex: BookOpen,
  warehouse: Warehouse,
  achievements: Trophy,
};

const TABS: { id: NonNullable<ActiveMenu>; label: string }[] = [
  { id: "settings", label: "设置" },
  { id: "backpack", label: "灵感手记" },
  { id: "codex", label: "图鉴" },
  { id: "warehouse", label: "仓库" },
  { id: "achievements", label: "成就" },
];

const TAB_ONBOARDING_ATTR: Record<NonNullable<ActiveMenu>, string> = {
  settings: "settings-tab",
  backpack: "backpack-tab",
  codex: "codex-tab",
  warehouse: "warehouse-tab",
  achievements: "achievements-tab",
};

interface UnifiedMenuModalProps {
  activeMenu: ActiveMenu;
  onClose: () => void;
  onUseItem: (item: Item) => void;
  /** True while a DM turn locks the session (submit / options / talent); disables item consume in backpack. */
  isChatBusy: boolean;
  audioMuted: boolean;
  onToggleMute: () => void;
  /** 打开外层退出确认浮窗；仅负责触发，不在设置面板里直接执行结算或跳转。 */
  onRequestExit: () => void;
  /** Called when user views codex/warehouse tab (for account-first onboarding) */
  onViewedTab?: (tab: "codex" | "warehouse") => void;
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
  onCertifyProfession,
  onSwitchProfession,
  onActivateProfessionActive,
  mainThreatByFloor,
  codex,
  tasks,
  equippedWeapon,
  weaponBag,
  isChatBusy,
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
  onCertifyProfession: (profession: ProfessionId) => boolean;
  onSwitchProfession: (profession: ProfessionId) => boolean;
  onActivateProfessionActive: () => { ok: boolean; reason?: string; tip?: string };
  mainThreatByFloor: ReturnType<typeof useGameStore.getState>["mainThreatByFloor"];
  codex: Record<string, CodexEntry>;
  tasks: GameTask[];
  equippedWeapon: Weapon | null;
  weaponBag: Weapon[];
  isChatBusy: boolean;
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

      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-widest text-slate-400">武器栏</h3>
        <WeaponSlotPanel equippedWeapon={equippedWeapon} weaponBag={weaponBag} busy={isChatBusy} />
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
            <p className="text-[11px] leading-relaxed text-slate-400">暂无职业，请去1楼认证。</p>
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

function BackpackPanel({
  inventory,
  originium,
  selectedId,
  onSelect,
  onUseItem,
  isChatBusy,
  stats,
}: {
  inventory: Item[];
  originium: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onUseItem: (item: Item) => void;
  isChatBusy: boolean;
  stats: Record<StatType, number>;
}) {
  const safeInventory = Array.isArray(inventory) ? inventory : [];
  const slotItems = Array.from({ length: 6 }, (_, idx) => safeInventory[idx] ?? null);
  const selectedItem = selectedId ? safeInventory.find((i) => i && i.id === selectedId) ?? null : null;

  useEffect(() => {
    if (selectedId && !selectedItem) onSelect(null);
  }, [selectedId, selectedItem, onSelect]);

  const weaponizableHintCount = safeInventory.filter((it) => {
    const tier = it?.tier;
    const eligible = (it as any)?.weaponization?.eligible;
    return (tier === "S" || tier === "A" || tier === "B" || tier === "C") && eligible !== false;
  }).length;

  return (
    <div className="flex h-full flex-row overflow-hidden">
      <div className="flex w-2/5 flex-col border-r border-white/10">
        <div className="border-b border-white/10 px-4 py-3">
          <h3 className="text-sm font-semibold tracking-widest text-slate-400">
            灵感手记
          </h3>
          <div className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-white/10 to-transparent border border-white/10 rounded-xl mb-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]">
            <div className="h-4 w-4 rounded-full bg-gradient-to-br from-amber-300 to-orange-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]" />
            <span className="text-sm font-bold tabular-nums text-amber-300">{originium}</span>
            <span className="text-xs text-amber-400/90">原石</span>
          </div>
          {weaponizableHintCount > 0 ? (
            <div className="mt-2 rounded-xl border border-amber-400/15 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-200">
              你有可武器化道具。去「配电间」查看锻造台，可将 C+ 道具武器化为主手装备。
            </div>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {slotItems.every((s) => s === null) ? (
            <p className="py-4 text-xs text-slate-500">暂无</p>
          ) : (
            <div className="space-y-2">
              {slotItems.map((item, idx) => {
                const isSelected = item && selectedId === item.id;
                const firstIdx = item ? safeInventory.findIndex((i) => i && i.id === item.id) : -1;
                const count = item && firstIdx === idx ? safeInventory.filter((i) => i && i.id === item.id).length : 0;
                return (
                  <button
                    key={item?.id ?? `empty-${idx}`}
                    type="button"
                    onClick={() => item && onSelect(isSelected ? null : item.id)}
                    className={`w-full rounded-xl px-4 py-3 text-left text-sm transition ${
                      item
                        ? selectedId === item.id
                          ? "bg-indigo-500/30 text-white"
                          : "bg-white/5 text-slate-300 hover:bg-indigo-500/10"
                        : "bg-white/5 text-slate-500 hover:bg-white/10"
                    }`}
                  >
                    {item ? (
                      <span className="block truncate">
                        {item.name}
                        {count > 1 ? ` × ${count}` : ""}
                        {(() => {
                          const tier = item.tier;
                          const eligible = (item as any)?.weaponization?.eligible;
                          const isWeaponizable = (tier === "S" || tier === "A" || tier === "B" || tier === "C") && eligible !== false;
                          return isWeaponizable ? (
                            <span className="ml-2 rounded-full border border-amber-400/20 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-200">
                              可武器化
                            </span>
                          ) : null;
                        })()}
                      </span>
                    ) : (
                      <span className="block truncate">空</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-1 flex-col overflow-y-auto p-6">
        {selectedItem && typeof selectedItem === "object" ? (
          <>
            <h3 className="text-xl font-bold text-white">{selectedItem.name ?? "未知"}</h3>
            <p className="mt-1 text-xs uppercase tracking-wider text-slate-500">
              {selectedItem.tier ?? "D"}
            </p>
            <div className="mt-6 space-y-4">
              {getItemEffectSummary(selectedItem) && (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
                  <span className="text-[10px] uppercase tracking-wider text-emerald-400">效果</span>
                  <p className="mt-0.5 text-sm font-medium text-emerald-200">{getItemEffectSummary(selectedItem)}</p>
                </div>
              )}
              <div>
                <span className="text-xs text-slate-500">描述</span>
                <p className="mt-1 text-sm leading-relaxed text-slate-300">{selectedItem.description ?? ""}</p>
              </div>
              {formatStatRequirements(selectedItem) && (
                <div>
                  <span className="text-xs text-slate-500">使用条件</span>
                  <p className="mt-1 text-sm text-amber-300">{formatStatRequirements(selectedItem)}</p>
                </div>
              )}
              {selectedItem?.statBonus && typeof selectedItem.statBonus === "object" && Object.keys(selectedItem.statBonus).length > 0 && (
                <div>
                  <span className="text-xs text-slate-500">叙事维度</span>
                  <p className="mt-1 text-sm text-indigo-300">
                    {Object.entries(selectedItem.statBonus)
                      .map(([k, v]) => `${STAT_LABELS[k as StatType] ?? k}: ${v}`)
                      .join(", ")}
                  </p>
                </div>
              )}
              {(() => {
                const useCheck = canUseItem(selectedItem, stats);
                return (
                  <button
                    type="button"
                    onClick={() => { if (useCheck.ok) { onUseItem(selectedItem); onSelect(null); } }}
                    disabled={isChatBusy || !useCheck.ok}
                    title={!useCheck.ok ? useCheck.reason : undefined}
                    className="mt-4 w-full rounded-xl border border-indigo-400/40 bg-indigo-500/30 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500/40 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {useCheck.ok ? "消耗灵感" : useCheck.reason ?? "无法消耗"}
                  </button>
                );
              })()}
            </div>
          </>
        ) : (
          <p className="text-slate-500">选择左侧条目查看详情</p>
        )}
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

function WarehousePanel({ warehouse }: { warehouse: WarehouseItem[] }) {
  const [selected, setSelected] = useState<WarehouseItem | null>(null);
  return (
    <div className="flex h-full flex-col overflow-hidden p-6">
      <h3 className="mb-4 text-sm font-semibold tracking-widest text-slate-400">仓库</h3>
      <p className="mb-3 text-xs text-slate-500">物品存放于此，无叙事维度要求。使用时有正向作用与对应副作用，收益略大于副作用。</p>
      <div className="grid min-h-0 flex-1 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
        {(warehouse ?? []).map((w) => (
          <button
            key={w.id}
            type="button"
            onClick={() => setSelected(selected?.id === w.id ? null : w)}
            className={`flex min-h-[64px] flex-col items-center justify-center rounded-xl border p-2 text-left transition ${
              selected?.id === w.id ? "border-amber-400/50 bg-amber-500/20" : "border-white/20 bg-slate-800/40 hover:bg-slate-800/60"
            }`}
          >
            <span className="truncate w-full text-center text-xs font-semibold text-white">{w.name}</span>
            <span className="mt-0.5 text-[10px] text-slate-500">{"floor" in w && w.floor ? FLOOR_LABELS[String(w.floor)] ?? String(w.floor) : ""}</span>
          </button>
        ))}
      </div>
      {selected && (
        <div className="mt-4 rounded-xl border border-white/10 bg-slate-800/60 p-4">
          <h4 className="text-sm font-semibold text-white">{selected.name}</h4>
          <p className="mt-1 text-xs text-slate-400">{selected.description}</p>
          {"benefit" in selected && selected.benefit && (
            <div className="mt-2">
              <span className="text-[10px] text-emerald-400">正向：</span>
              <p className="text-xs text-slate-300">{selected.benefit}</p>
            </div>
          )}
          {"sideEffect" in selected && selected.sideEffect && (
            <div className="mt-1">
              <span className="text-[10px] text-amber-400">副作用：</span>
              <p className="text-xs text-slate-400">{selected.sideEffect}</p>
            </div>
          )}
          {"isResurrection" in selected && selected.isResurrection && (
            <span className="mt-2 inline-block rounded bg-rose-500/20 px-2 py-0.5 text-[10px] text-rose-300">复活物品</span>
          )}
        </div>
      )}
    </div>
  );
}

const ACHIEVEMENT_GRADE_STYLES: Record<AchievementGrade, string> = {
  S: "bg-gradient-to-br from-amber-400 to-amber-500 text-transparent bg-clip-text drop-shadow-[0_0_8px_rgba(251,191,36,0.5)] font-bold",
  A: "text-cyan-300 font-semibold",
  B: "text-violet-300 font-semibold",
  C: "text-sky-300 font-medium",
  D: "text-slate-300 font-medium",
  E: "text-slate-500",
};

function AchievementsPanel({ records }: { records: AchievementRecord[] }) {
  return (
    <div className="p-6">
      <h3 className="mb-4 text-sm font-semibold tracking-widest text-slate-400">本机成就预览</h3>
      <p className="mb-4 text-xs text-slate-500">仅用于快速回看（缓存），以本机成就预览为准。</p>
      <div className="max-h-[55vh] space-y-4 overflow-y-auto">
        {records.length === 0 ? (
          <p className="py-8 text-center text-xs text-slate-500">暂无成就记录。完成结算后可在此查看。</p>
        ) : (
          records.map((r, idx) => (
            <div
              key={`${r.createdAt}-${idx}`}
              className="rounded-xl border border-slate-600/50 bg-slate-800/40 p-4"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className={`text-xl ${ACHIEVEMENT_GRADE_STYLES[r.grade]}`}>{r.grade}</span>
                <span className="text-xs text-slate-500">存活 {r.survivalTimeText}</span>
              </div>
              <div className="mb-2 grid grid-cols-2 gap-2 text-xs">
                <span className="text-slate-500">消灭诡异</span>
                <span className="text-slate-200">{r.kills} 只</span>
                <span className="text-slate-500">最高抵达</span>
                <span className="text-slate-200">{r.maxFloorDisplay}</span>
              </div>
              <div className="mt-2 border-t border-slate-600/50 pt-2">
                <p className="text-[11px] leading-relaxed text-slate-400">{r.reviewLine1}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{r.reviewLine2}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function TasksPanel({ tasks, originium }: { tasks: GameTask[]; originium: number }) {
  const visibleTasks = tasks.filter((t) => t.status !== "hidden");
  const updateTaskStatus = useGameStore((s) => s.updateTaskStatus);
  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-widest text-slate-400">契约追踪</h3>
        <div className="flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1">
          <div className="h-3 w-3 rounded-full bg-gradient-to-br from-amber-300 to-orange-500 shadow-[0_0_6px_rgba(245,158,11,0.6)]" />
          <span className="text-xs font-bold tabular-nums text-amber-300">{originium}</span>
          <span className="text-[10px] text-amber-400/70">原石</span>
        </div>
      </div>
      <div className="max-h-[50vh] space-y-3 overflow-y-auto">
        {visibleTasks.length === 0 ? (
          <p className="py-8 text-center text-xs text-slate-500">暂无任务。与 NPC 互动或探索可获取任务。</p>
        ) : (
          visibleTasks.map((t) => (
            <div
              key={t.id}
              className={`rounded-xl border p-4 ${
                t.status === "active"
                  ? "border-amber-400/30 bg-amber-500/5"
                  : t.status === "completed"
                    ? "border-emerald-400/30 bg-emerald-500/5 opacity-70"
                    : t.status === "available"
                      ? "border-indigo-400/30 bg-indigo-500/5"
                    : "border-red-400/30 bg-red-500/5 opacity-50"
              }`}
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm font-semibold text-white">{t.title}</span>
                <span className={`text-[10px] font-medium uppercase tracking-wider ${
                  t.status === "active"
                    ? "text-amber-400"
                    : t.status === "completed"
                      ? "text-emerald-400"
                      : t.status === "available"
                        ? "text-indigo-300"
                        : "text-red-400"
                }`}>
                  {getTaskStatusLabel(t.status)}
                </span>
              </div>
              <p className="text-xs leading-relaxed text-slate-300">{t.desc}</p>
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-slate-500">
                <span>委托人：{t.issuerName}</span>
                <span>楼层：{t.floorTier}</span>
                <span className="col-span-2">
                  领取方式：{t.claimMode === "npc_grant" ? "NPC提出委托" : t.claimMode === "auto" ? "自动记录" : "手动领取"}
                  {t.claimMode === "manual" && t.issuerId ? `（发放：${t.issuerId}）` : ""}
                </span>
                <span className="col-span-2">
                  奖励：{t.reward?.items?.length ? `道具 ${t.reward.items.length} 件` : (t.reward?.originium ? `原石 +${t.reward.originium}` : "线索")}
                </span>
                {t.nextHint ? <span className="col-span-2 text-indigo-300">下一步：{t.nextHint}</span> : null}
              </div>
              {t.status === "available" && t.claimMode === "manual" ? (
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => updateTaskStatus(t.id, "active")}
                    className="rounded-lg border border-indigo-300/30 bg-indigo-500/15 px-3 py-1.5 text-[11px] font-semibold text-indigo-100 hover:bg-indigo-500/20"
                  >
                    接取
                  </button>
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function UnifiedMenuModal({
  activeMenu,
  onClose,
  onUseItem,
  isChatBusy,
  audioMuted,
  onToggleMute,
  onRequestExit,
  onViewedTab,
}: UnifiedMenuModalProps) {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [codexPage, setCodexPage] = useState(0);
  const [selectedCodexId, setSelectedCodexId] = useState<string | null>(null);

  const stats = useGameStore((s) => s.stats) ?? { ...FALLBACK_STATS };
  const historicalMaxSanity = useGameStore((s) => s.historicalMaxSanity ?? 50);
  const inventory = useGameStore((s) => s.inventory) ?? [];
  const codex = useGameStore((s) => s.codex ?? {});
  const warehouse = useGameStore((s) => s.warehouse ?? []);
  const tasks = useGameStore((s) => s.tasks ?? []);
  const originium = useGameStore((s) => s.originium ?? 0);
  const upgradeAttribute = useGameStore((s) => s.upgradeAttribute);
  const playerLocation = useGameStore((s) => s.playerLocation ?? "B1_SafeZone");
  const time = useGameStore((s) => s.time ?? { day: 0, hour: 0 });
  const mainThreatByFloor = useGameStore((s) => s.mainThreatByFloor ?? {});
  const setHasCheckedCodex = useGameStore((s) => s.setHasCheckedCodex);
  // 单线时间线：不再暴露分支存档 UI
  const professionState = useGameStore((s) => s.professionState);
  const refreshProfessionState = useGameStore((s) => s.refreshProfessionState);
  const certifyProfession = useGameStore((s) => s.certifyProfession);
  const switchProfession = useGameStore((s) => s.switchProfession);
  const activateProfessionActive = useGameStore((s) => s.activateProfessionActive);
  const equippedWeapon = useGameStore((s) => s.equippedWeapon ?? null);
  const weaponBag = useGameStore((s) => s.weaponBag ?? []);

  const volume = useGameStore((s) => s.volume);
  const setVolume = useGameStore((s) => s.setVolume);
  const achievementRecords = useAchievementsStore((s) => s.records ?? []);

  const currentTab = activeMenu ?? "settings";

  function handleRequestExit() {
    // 设置页仅触发二次确认浮窗；真正的“存档并退出/直接退出”由外层统一处理，避免分叉逻辑。
    onClose();
    onRequestExit();
  }

  function handleTabSelect(id: ActiveMenu) {
    if (id === "codex") {
      setHasCheckedCodex(true);
      onViewedTab?.("codex");
    }
    if (id === "warehouse") onViewedTab?.("warehouse");
    useGameStore.getState().setActiveMenu(id);
  }

  const isOpen = activeMenu !== null;

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
          {/* 左侧侧边栏 */}
          <aside className="flex w-20 min-w-[72px] sm:w-1/4 flex-col border-r border-white/10 bg-black/20 p-3 sm:p-4">
          <h2 id="unified-menu-title" className="sr-only">
            控制中枢
          </h2>
          <div className="flex flex-1 min-h-0 flex-col items-center gap-2 sm:gap-3 overflow-y-auto py-1">
            {TABS.map((tab) => {
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

        {/* 右侧内容区 - Activity 保留各 Tab 的 DOM/状态，hidden 时暂停 useEffect */}
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
              onCertifyProfession={certifyProfession}
              onSwitchProfession={switchProfession}
              onActivateProfessionActive={activateProfessionActive}
              mainThreatByFloor={mainThreatByFloor}
              codex={codex}
              tasks={tasks}
              equippedWeapon={equippedWeapon}
              weaponBag={weaponBag}
              isChatBusy={isChatBusy}
            />
          </Activity>
          <Activity mode={currentTab === "backpack" ? "visible" : "hidden"}>
            <BackpackPanel
              inventory={inventory}
              originium={originium}
              selectedId={selectedItemId}
              onSelect={setSelectedItemId}
              onUseItem={onUseItem}
              isChatBusy={isChatBusy}
              stats={stats}
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
          <Activity mode={currentTab === "warehouse" ? "visible" : "hidden"}>
            <WarehousePanel warehouse={warehouse} />
          </Activity>
          <Activity mode={currentTab === "achievements" ? "visible" : "hidden"}>
            <AchievementsPanel records={achievementRecords} />
          </Activity>
        </main>
      </div>
    </div>
    </Activity>
  );
}
