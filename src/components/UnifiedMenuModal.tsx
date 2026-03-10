"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Settings, Package, BookOpen, Warehouse, ClipboardList } from "lucide-react";
import type { Item, StatType } from "@/lib/registry/types";
import { NPCS } from "@/lib/registry/npcs";
import { useGameStore, type CodexEntry, type GameTask } from "@/store/useGameStore";
import { useGameStore as usePersistStore, type ActiveMenu } from "@/store/gameStore";

const STAT_ORDER: StatType[] = ["sanity", "agility", "luck", "charm", "background"];
const STAT_LABELS: Record<StatType, string> = {
  sanity: "理智",
  agility: "敏捷",
  luck: "幸运",
  charm: "魅力",
  background: "出身",
};
const STAT_MAX = 50;

const LOCATION_LABELS: Record<string, string> = {
  B2_Passage: "B2 通道",
  B2_GatekeeperDomain: "B2 守门领域",
  B1_SafeZone: "B1 安全区",
  B1_Storage: "B1 储物间",
  B1_Laundry: "B1 洗衣房",
  B1_PowerRoom: "B1 配电间",
  "1F_Lobby": "1 楼门厅",
  "1F_PropertyOffice": "1 楼物业办公室",
  "1F_GuardRoom": "1 楼保安室",
  "1F_Mailboxes": "1 楼信箱区",
  "2F_Clinic201": "2 楼 201 诊室",
  "2F_Room202": "2 楼 202 室",
  "2F_Room203": "2 楼 203 室",
  "2F_Corridor": "2 楼走廊",
  "3F_Room301": "3 楼 301 室",
  "3F_Room302": "3 楼 302 室",
  "3F_Stairwell": "3 楼楼梯间",
  "4F_Room401": "4 楼 401 室",
  "4F_Room402": "4 楼 402 室",
  "4F_CorridorEnd": "4 楼走廊尽头",
  "5F_Room501": "5 楼 501 室",
  "5F_Room502": "5 楼 502 室",
  "5F_Studio503": "5 楼 503 画室",
  "6F_Room601": "6 楼 601 室",
  "6F_Room602": "6 楼 602 室",
  "6F_Stairwell": "6 楼楼梯间",
  "7F_Room701": "7 楼 701 室",
  "7F_Bench": "7 楼长椅区",
  "7F_Kitchen": "7 楼厨房",
  "7F_SealedDoor": "7 楼封闭门区",
};

const NPC_NAME_BY_ID = new Map(NPCS.map((npc) => [npc.id, npc.name]));
const NPC_NAMES = NPCS.map((npc) => npc.name).filter(Boolean);

function toSeed(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function pickNpcNameBySeed(seedText: string): string {
  if (NPC_NAMES.length === 0) return "无名委托人";
  const idx = toSeed(seedText || String(Date.now())) % NPC_NAMES.length;
  return NPC_NAMES[idx] ?? NPC_NAMES[0] ?? "无名委托人";
}

function normalizeIssuerName(rawIssuer: unknown, seedText: string): string {
  const issuer = typeof rawIssuer === "string" ? rawIssuer.trim() : "";
  if (!issuer) return pickNpcNameBySeed(seedText);
  if (issuer === "未知" || issuer.toLowerCase() === "unknown") return pickNpcNameBySeed(seedText);
  if (NPC_NAME_BY_ID.has(issuer)) return NPC_NAME_BY_ID.get(issuer) ?? pickNpcNameBySeed(seedText);
  if (NPC_NAMES.includes(issuer)) return issuer;
  return pickNpcNameBySeed(seedText);
}

function formatLocationLabel(location: string): string {
  if (!location) return "未知区域";
  return LOCATION_LABELS[location] ?? location.replace(/_/g, " ");
}

const TAB_ICONS = {
  settings: Settings,
  backpack: Package,
  codex: BookOpen,
  warehouse: Warehouse,
  tasks: ClipboardList,
} as const;

const TABS: { id: ActiveMenu; label: string }[] = [
  { id: "settings", label: "设置" },
  { id: "backpack", label: "行囊" },
  { id: "codex", label: "图鉴" },
  { id: "warehouse", label: "仓库" },
  { id: "tasks", label: "任务" },
];

interface UnifiedMenuModalProps {
  activeMenu: ActiveMenu;
  onClose: () => void;
  onUseItem: (item: Item) => void;
  isStreaming: boolean;
}

function StatBar({ statName, value, isDanger }: { statName: string; value: number; isDanger: boolean }) {
  const bar1 = (Math.min(value, 25) / 25) * 100;
  const bar2 = (Math.max(0, value - 25) / 25) * 100;
  const fillGradient = isDanger ? "from-red-600 to-red-500" : "from-indigo-500 to-blue-400";
  const bar2Gradient = isDanger ? "from-red-500 to-rose-400" : "from-purple-500 to-fuchsia-400";
  return (
    <div className="mb-4">
      <div className="mb-1 flex justify-between">
        <span className={`text-sm font-medium ${isDanger ? "text-red-400" : "text-slate-300"}`}>{statName}</span>
        <span className="text-xs font-mono text-slate-500">{value} / {STAT_MAX}</span>
      </div>
      <div className="flex flex-col gap-1">
        <div className="h-1.5 w-full rounded-full overflow-hidden bg-slate-800/50">
          <div className={`h-full bg-gradient-to-r ${fillGradient} transition-all`} style={{ width: `${bar1}%` }} />
        </div>
        <div className="h-1.5 w-full rounded-full overflow-hidden bg-slate-800/50">
          <div className={`h-full bg-gradient-to-r ${bar2Gradient} transition-all`} style={{ width: `${bar2}%` }} />
        </div>
      </div>
    </div>
  );
}

function SettingsPanel({
  stats,
  playerLocation,
  volume,
  setVolume,
  onExitGame,
}: {
  stats: Record<StatType, number>;
  playerLocation: string;
  volume: number;
  setVolume: (v: number) => void;
  onExitGame: () => void;
}) {
  const displayLocation = formatLocationLabel(playerLocation);
  return (
    <div className="space-y-8 p-6">
      <div>
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-slate-400">属性与坐标</h3>
        <div className="space-y-2">
          {STAT_ORDER.map((k) => (
            <StatBar
              key={k}
              statName={STAT_LABELS[k]}
              value={stats[k] ?? 0}
              isDanger={k === "sanity" && (stats[k] ?? 0) <= 3}
            />
          ))}
        </div>
        <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
          <span className="text-xs text-slate-500">当前位置</span>
          <p className="mt-1 font-semibold text-cyan-300 drop-shadow-[0_0_8px_rgba(34,211,238,0.4)]">
            {displayLocation}
          </p>
        </div>
      </div>

      <div>
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-slate-400">音量调节</h3>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min={0}
            max={100}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            className="h-2 w-48 flex-1 appearance-none rounded-full bg-slate-700 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-indigo-400 [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(99,102,241,0.6)]"
          />
          <span className="w-10 text-right font-mono text-sm text-slate-400">{volume}</span>
        </div>
      </div>

      <div>
        <button
          type="button"
          onClick={onExitGame}
          className="rounded-xl border border-red-500/40 bg-red-950/50 px-6 py-3 text-sm font-semibold text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.2)] transition-all hover:border-red-500/60 hover:bg-red-900/50 hover:shadow-[0_0_25px_rgba(239,68,68,0.4)]"
        >
          退出游戏
        </button>
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
  isStreaming,
}: {
  inventory: Item[];
  originium: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onUseItem: (item: Item) => void;
  isStreaming: boolean;
}) {
  const slotItems = Array.from({ length: 6 }, (_, idx) => inventory[idx] ?? null);
  const selectedItem = selectedId ? inventory.find((i) => i.id === selectedId) : null;

  return (
    <div className="flex h-full flex-row overflow-hidden">
      <div className="flex w-2/5 flex-col border-r border-white/10">
        <div className="border-b border-white/10 px-4 py-3">
          <h3 className="text-sm font-semibold tracking-widest text-slate-400">
            行囊
          </h3>
          <div className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-white/10 to-transparent border border-white/10 rounded-xl mb-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]">
            <div className="h-4 w-4 rounded-full bg-gradient-to-br from-amber-300 to-orange-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]" />
            <span className="text-sm font-bold tabular-nums text-amber-300">{originium}</span>
            <span className="text-xs text-amber-400/90">原石</span>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {slotItems.length === 0 ? (
            <p className="py-4 text-xs text-slate-500">暂无</p>
          ) : (
            <div className="space-y-2">
              {slotItems.map((item, idx) => {
                const isSelected = item && selectedId === item.id;
                const firstIdx = item ? inventory.findIndex((i) => i.id === item.id) : -1;
                const count = item && firstIdx === idx ? inventory.filter((i) => i.id === item.id).length : 0;
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
        {selectedItem ? (
          <>
            <h3 className="text-xl font-bold text-white">{selectedItem.name}</h3>
            <p className="mt-1 text-xs uppercase tracking-wider text-slate-500">
              {selectedItem.tier}
            </p>
            <div className="mt-6 space-y-4">
              <div>
                <span className="text-xs text-slate-500">描述</span>
                <p className="mt-1 text-sm leading-relaxed text-slate-300">{selectedItem.description}</p>
              </div>
              {selectedItem.statBonus && Object.keys(selectedItem.statBonus).length > 0 && (
                <div>
                  <span className="text-xs text-slate-500">属性</span>
                  <p className="mt-1 text-sm text-indigo-300">
                    {Object.entries(selectedItem.statBonus)
                      .map(([k, v]) => `${STAT_LABELS[k as StatType] ?? k}: ${v}`)
                      .join(", ")}
                  </p>
                </div>
              )}
              <button
                type="button"
                onClick={() => { onUseItem(selectedItem); onSelect(null); }}
                disabled={isStreaming}
                className="mt-4 w-full rounded-xl border border-indigo-400/40 bg-indigo-500/30 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500/40 disabled:opacity-40"
              >
                使用该物品
              </button>
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
                  {e.name}
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
            <h3 className="text-xl font-bold text-white">{selectedEntry.name}</h3>
            <p className="mt-1 text-xs uppercase tracking-wider text-slate-500">
              {selectedEntry.type === "npc" ? "徘徊者" : "诡异"}
            </p>
            <div className="mt-6 space-y-4">
              <div>
                <span className="text-xs text-slate-500">好感度</span>
                <p className={`mt-1 font-bold ${(selectedEntry.favorability ?? 0) >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {selectedEntry.favorability ?? 0}
                </p>
              </div>
              {typeof selectedEntry.combatPower === "number" && (
                <div>
                  <span className="text-xs text-slate-500">战斗力</span>
                  <p className="mt-1 font-semibold text-slate-200">{selectedEntry.combatPower}</p>
                </div>
              )}
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

function WarehousePanel({ warehouse }: { warehouse: Item[] }) {
  return (
    <div className="p-6">
      <h3 className="mb-4 text-sm font-semibold tracking-widest text-slate-400">仓库</h3>
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 12 }, (_, idx) => {
          const item = warehouse[idx];
          return (
            <div
              key={item?.id ?? `empty-${idx}`}
              className={`flex min-h-[72px] flex-col items-center justify-center rounded-xl border p-3 ${
                item ? "border-white/20 bg-slate-800/40" : "border-white/5 bg-black/30"
              }`}
            >
              {item ? (
                <>
                  <span className="truncate w-full text-center text-xs font-semibold text-white">{item.name}</span>
                  {item.description && (
                    <span className="mt-1 line-clamp-2 text-[10px] text-slate-400">{item.description}</span>
                  )}
                </>
              ) : (
                <span className="text-xs text-slate-600">空</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TasksPanel({ tasks, originium }: { tasks: GameTask[]; originium: number }) {
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
        {tasks.length === 0 ? (
          <p className="py-8 text-center text-xs text-slate-500">暂无任务。与 NPC 互动或探索可获取任务。</p>
        ) : (
          tasks.map((t) => (
            <div
              key={t.id}
              className={`rounded-xl border p-4 ${
                t.status === "active"
                  ? "border-amber-400/30 bg-amber-500/5"
                  : t.status === "completed"
                    ? "border-emerald-400/30 bg-emerald-500/5 opacity-70"
                    : "border-red-400/30 bg-red-500/5 opacity-50"
              }`}
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm font-semibold text-white">{t.title}</span>
                <span className={`text-[10px] font-medium uppercase tracking-wider ${
                  t.status === "active" ? "text-amber-400" : t.status === "completed" ? "text-emerald-400" : "text-red-400"
                }`}>
                  {t.status === "active" ? "进行中" : t.status === "completed" ? "已完成" : "已失败"}
                </span>
              </div>
              <p className="text-xs leading-relaxed text-slate-300">{t.desc}</p>
              <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
                <span>委托人：{normalizeIssuerName(t.issuer, t.id)}</span>
                <span>奖励：{t.reward}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function UnifiedMenuModal({ activeMenu, onClose, onUseItem, isStreaming }: UnifiedMenuModalProps) {
  const router = useRouter();
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [codexPage, setCodexPage] = useState(0);
  const [selectedCodexId, setSelectedCodexId] = useState<string | null>(null);

  const stats = useGameStore((s) => s.stats);
  const inventory = useGameStore((s) => s.inventory);
  const codex = useGameStore((s) => s.codex ?? {});
  const warehouse = useGameStore((s) => s.warehouse ?? []);
  const tasks = useGameStore((s) => s.tasks ?? []);
  const originium = useGameStore((s) => s.originium ?? 0);
  const playerLocation = useGameStore((s) => s.playerLocation ?? "B1_SafeZone");
  const resetForNewGame = useGameStore((s) => s.resetForNewGame);
  const setHasReadParchment = useGameStore((s) => s.setHasReadParchment);
  const setHasCheckedCodex = useGameStore((s) => s.setHasCheckedCodex);

  const volume = usePersistStore((s) => s.volume);
  const setVolume = usePersistStore((s) => s.setVolume);

  const currentTab = activeMenu ?? "settings";

  function handleExitGame() {
    resetForNewGame();
    onClose();
    router.push("/");
  }

  function handleTabSelect(id: ActiveMenu) {
    if (id === "backpack") setHasReadParchment(true);
    if (id === "codex") setHasCheckedCodex(true);
    usePersistStore.getState().setActiveMenu(id);
  }

  if (activeMenu === null) return null;

  return (
    <div
      className="fixed inset-0 w-screen h-[100dvh] z-50 bg-black/60 backdrop-blur-2xl flex"
      role="dialog"
      aria-modal
      aria-labelledby="unified-menu-title"
    >
      <div
        className="flex h-full w-full overflow-hidden border-t border-white/10 bg-slate-900/60 shadow-[0_0_60px_rgba(0,0,0,0.8)] backdrop-blur-3xl"
        id="unified-menu-content"
      >
        {/* 左侧侧边栏 */}
        <aside className="flex w-1/4 flex-col border-r border-white/10 bg-black/20 p-4">
          <h2 id="unified-menu-title" className="sr-only">
            控制中枢
          </h2>
          <div className="flex flex-col items-center gap-3">
            {TABS.map((tab) => {
              const isActive = currentTab === tab.id;
              const Icon = TAB_ICONS[tab.id];
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleTabSelect(tab.id)}
                  className={`flex flex-col items-center justify-center gap-1.5 w-16 h-16 rounded-2xl transition-all duration-500 cursor-pointer ${
                    isActive
                      ? "text-white bg-white/10 border border-white/20 shadow-[0_0_20px_rgba(255,255,255,0.15)] drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]"
                      : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
                  }`}
                >
                  <Icon className="h-6 w-6" strokeWidth={1.5} />
                  <span className="text-[10px] font-medium tracking-wide">{tab.label}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="mt-auto rounded-xl border border-white/10 px-4 py-2.5 text-sm text-slate-400 transition hover:bg-white/5 hover:text-white"
          >
            关闭
          </button>
        </aside>

        {/* 右侧内容区 */}
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {currentTab === "settings" && (
            <SettingsPanel
              stats={stats}
              playerLocation={playerLocation}
              volume={volume}
              setVolume={setVolume}
              onExitGame={handleExitGame}
            />
          )}
          {currentTab === "backpack" && (
            <BackpackPanel
              inventory={inventory}
              originium={originium}
              selectedId={selectedItemId}
              onSelect={setSelectedItemId}
              onUseItem={onUseItem}
              isStreaming={isStreaming}
            />
          )}
          {currentTab === "codex" && (
            <CodexPanel
              codex={codex}
              selectedId={selectedCodexId}
              onSelect={setSelectedCodexId}
              page={codexPage}
              onPageChange={setCodexPage}
            />
          )}
          {currentTab === "warehouse" && <WarehousePanel warehouse={warehouse} />}
          {currentTab === "tasks" && <TasksPanel tasks={tasks} originium={originium} />}
        </main>
      </div>
    </div>
  );
}
