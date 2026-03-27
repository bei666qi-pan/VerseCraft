"use client";

import { useMemo, useState } from "react";
import type { GameTask } from "@/store/useGameStore";
import { getTaskStatusLabel } from "@/lib/tasks/taskV2";

type PlayTaskPanelProps = {
  open: boolean;
  tasks: GameTask[];
  originium: number;
  onClose: () => void;
  onClaimTask: (taskId: string) => void;
};

function statusStyle(status: GameTask["status"]): string {
  if (status === "active") return "border-amber-200 bg-amber-50 text-amber-800";
  if (status === "completed") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "available") return "border-indigo-200 bg-indigo-50 text-indigo-800";
  return "border-rose-200 bg-rose-50 text-rose-800";
}

export function PlayTaskPanel({ open, tasks, originium, onClose, onClaimTask }: PlayTaskPanelProps) {
  const visibleTasks = useMemo(
    () => (tasks ?? []).filter((t) => t && t.status !== "hidden"),
    [tasks]
  );
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  if (!open) return null;

  return (
    <aside className="pointer-events-auto fixed right-3 top-[84px] z-[72] w-[360px] max-w-[calc(100vw-24px)] rounded-2xl border border-slate-200 bg-white/95 shadow-[0_24px_56px_rgba(15,23,42,0.2)] backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold tracking-wider text-slate-800">任务栏</h3>
          <p className="text-[11px] text-slate-500">仅显示核心目标与奖励</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
            原石 {originium}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
          >
            收起
          </button>
        </div>
      </div>

      <div className="max-h-[58vh] overflow-y-auto p-3">
        {visibleTasks.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500">
            当前没有可追踪任务，继续探索会触发新线索。
          </div>
        ) : (
          <div className="space-y-2.5">
            {visibleTasks.map((t) => {
              const expanded = !!expandedIds[t.id];
              const reward =
                t.reward?.items?.length && t.reward.items.length > 0
                  ? `道具 ${t.reward.items.length} 件`
                  : t.reward?.originium
                  ? `原石 +${t.reward.originium}`
                  : "线索奖励";
              return (
                <article key={t.id} className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="line-clamp-1 text-sm font-semibold text-slate-800">{t.title}</h4>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusStyle(t.status)}`}>
                      {getTaskStatusLabel(t.status)}
                    </span>
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-xs text-slate-600">{t.nextHint || t.desc}</p>
                  <div className="mt-2 grid grid-cols-2 gap-y-1 text-[11px] text-slate-500">
                    <span>委托人：{t.issuerName}</span>
                    <span>楼层：{t.floorTier}</span>
                    <span className="col-span-2">奖励：{reward}</span>
                  </div>
                  <div className="mt-2.5 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setExpandedIds((prev) => ({ ...prev, [t.id]: !expanded }))}
                      className="text-[11px] font-medium text-slate-500 transition hover:text-slate-700"
                    >
                      {expanded ? "收起详情" : "展开详情"}
                    </button>
                    {t.status === "available" && t.claimMode === "manual" ? (
                      <button
                        type="button"
                        onClick={() => onClaimTask(t.id)}
                        className="rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 transition hover:bg-indigo-100"
                      >
                        接取
                      </button>
                    ) : null}
                  </div>
                  {expanded ? (
                    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-[11px] text-slate-600">
                      <p>任务描述：{t.desc}</p>
                      <p className="mt-1">领取方式：{t.claimMode === "npc_grant" ? "NPC提出委托" : t.claimMode === "auto" ? "自动记录" : "手动领取"}</p>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}

