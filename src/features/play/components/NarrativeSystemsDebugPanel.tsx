"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getNarrativeSystemsDebugTail,
  isNarrativeSystemsDebugEnabled,
  clearNarrativeSystemsDebugRing,
} from "@/lib/debug/narrativeSystemsDebugRing";

/**
 * 仅当 NEXT_PUBLIC_VERSECRAFT_SYSTEMS_DEBUG=1 构建时显示（树摇后无生产体积代价）。
 */
export function NarrativeSystemsDebugPanel() {
  const enabled = useMemo(() => isNarrativeSystemsDebugEnabled(), []);
  const [open, setOpen] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled || !open) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 800);
    return () => window.clearInterval(id);
  }, [enabled, open]);

  if (!enabled) return null;

  const tail = getNarrativeSystemsDebugTail(6);
  void tick;

  return (
    <div className="pointer-events-auto fixed bottom-3 right-3 z-[90] max-w-[min(100vw-1.5rem,22rem)] text-left">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="mb-1 rounded-lg border border-amber-500/50 bg-amber-950/90 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-100 shadow-lg"
      >
        {open ? "关闭叙事调试" : "叙事调试"}
      </button>
      {open ? (
        <div className="max-h-[50vh] overflow-y-auto rounded-xl border border-amber-500/40 bg-slate-950/95 p-2 text-[10px] text-amber-50 shadow-xl backdrop-blur">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="font-semibold text-amber-200">最近回合应用摘要</span>
            <button
              type="button"
              className="rounded border border-slate-600 px-1.5 py-0.5 text-slate-300"
              onClick={() => clearNarrativeSystemsDebugRing()}
            >
              清空
            </button>
          </div>
          {tail.length === 0 ? (
            <p className="text-slate-400">尚无记录；完成一回合叙事结算后出现。</p>
          ) : (
            <ul className="space-y-2">
              {tail.map((ev, i) => (
                <li key={`${ev.at}-${i}`} className="rounded-lg border border-slate-700/80 bg-slate-900/80 p-2">
                  <div className="font-mono text-[9px] text-slate-400">
                    {new Date(ev.at).toLocaleTimeString()}
                    {ev.changeSetApplied ? " · change_set 已应用" : ""}
                  </div>
                  <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 text-slate-200">
                    <span>手记条数</span>
                    <span className="text-right">{ev.journalClueTotal}</span>
                    <span>任务总数</span>
                    <span className="text-right">{ev.taskTotal}</span>
                    <span>本回合 clue_updates</span>
                    <span className="text-right">{ev.clueUpdatesInTurn}</span>
                    <span>本回合 new_tasks</span>
                    <span className="text-right">{ev.newTasksInTurn}</span>
                    <span>本回合 task_updates</span>
                    <span className="text-right">{ev.taskUpdatesInTurn}</span>
                    <span>本回合发背包</span>
                    <span className="text-right">{ev.awardedItemsInTurn}</span>
                    <span>本回合发仓库</span>
                    <span className="text-right">{ev.awardedWarehouseInTurn}</span>
                    <span>行囊/仓库计数</span>
                    <span className="text-right">
                      {ev.inventoryCount}/{ev.warehouseCount}
                    </span>
                  </div>
                  {ev.filteredHints.length > 0 ? (
                    <div className="mt-1.5 border-t border-slate-700 pt-1.5 text-rose-200/90">
                      <div className="font-semibold text-rose-300/90">过滤/跳过</div>
                      <ul className="mt-0.5 list-inside list-disc font-mono text-[9px]">
                        {ev.filteredHints.map((h) => (
                          <li key={h} className="break-all">
                            {h}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {ev.changeSetTrace.length > 0 ? (
                    <details className="mt-1.5">
                      <summary className="cursor-pointer text-slate-400">change_set_trace</summary>
                      <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-all font-mono text-[9px] text-slate-300">
                        {ev.changeSetTrace.join("\n")}
                      </pre>
                    </details>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[9px] text-slate-500">
            服务端另可设 VERSECRAFT_DM_CHANGESET_DEBUG=1 打 [dm_change_set] 日志。
          </p>
        </div>
      ) : null}
    </div>
  );
}
