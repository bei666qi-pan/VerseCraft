"use client";

import { useMemo, useState } from "react";
import type { StatType, Weapon } from "@/lib/registry/types";

const STAT_LABELS: Record<StatType, string> = {
  sanity: "精神",
  agility: "敏捷",
  luck: "幸运",
  charm: "魅力",
  background: "出身",
};

function clampInt(n: unknown, min: number, max: number): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.trunc(n) : Number(String(n ?? ""));
  const safe = Number.isFinite(v) ? Math.trunc(v) : min;
  return Math.max(min, Math.min(max, safe));
}

function formatWeaponStatRequirements(weapon: Weapon | null): string {
  const req = (weapon as any)?.effectSource?.statRequirements as Record<string, unknown> | undefined;
  if (!req || typeof req !== "object") return "无";
  const parts: string[] = [];
  for (const k of Object.keys(STAT_LABELS) as StatType[]) {
    const v = req[k];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) {
      parts.push(`${STAT_LABELS[k]}≥${Math.trunc(v)}`);
    }
  }
  return parts.length > 0 ? parts.join("，") : "无";
}

function formatEffectSummary(weapon: Weapon | null): string {
  const s = (weapon as any)?.effectSource?.effectSummary;
  if (typeof s === "string" && s.trim()) return s.trim();
  const tags = Array.isArray(weapon?.counterTags) ? weapon!.counterTags : [];
  if (tags.length > 0) return `反制倾向：${tags.slice(0, 4).join(" / ")}`;
  return "未记录（以系统裁决为准）";
}

function formatSourceLine(weapon: Weapon | null): string {
  const prov = (weapon as any)?.provenance;
  if (prov && typeof prov === "object") {
    const kind = String((prov as any).kind ?? "").trim();
    const items = Array.isArray((prov as any).sourceItemIds) ? (prov as any).sourceItemIds : [];
    if ((kind === "weaponize" || kind === "weaponized_item") && items.length > 0) {
      return `来自武器化：${items.slice(0, 4).join("，")}${items.length > 4 ? "…" : ""}`;
    }
    if (kind) return `来源：${kind}`;
  }
  const src = (weapon as any)?.effectSource?.effectType;
  if (typeof src === "string" && src.trim()) return `效果来源：${src.trim()}`;
  return "来源：未记录";
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const el = document.createElement("textarea");
      el.value = text;
      el.style.position = "fixed";
      el.style.left = "-9999px";
      document.body.appendChild(el);
      el.focus();
      el.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(el);
      return ok;
    } catch {
      return false;
    }
  }
}

export function WeaponSlotPanel({
  equippedWeapon,
  weaponBag,
  busy,
}: {
  equippedWeapon: Weapon | null;
  weaponBag: Weapon[];
  busy: boolean;
}) {
  const [tip, setTip] = useState<string | null>(null);
  const hasWeapon = Boolean(equippedWeapon);

  const stability = clampInt((equippedWeapon as any)?.stability ?? 0, 0, 100);
  const contamination = clampInt((equippedWeapon as any)?.contamination ?? 0, 0, 100);
  const repairable = (equippedWeapon as any)?.repairable;
  const repairableText = typeof repairable === "boolean" ? (repairable ? "可维护" : "不可维护") : "未知";

  const mods = useMemo(() => {
    const m = (equippedWeapon as any)?.currentMods;
    return Array.isArray(m) ? m.filter((x: unknown): x is string => typeof x === "string" && x.trim()).slice(0, 6) : [];
  }, [equippedWeapon]);
  const infusions = useMemo(() => {
    const arr = (equippedWeapon as any)?.currentInfusions;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x: unknown) => x && typeof x === "object" && !Array.isArray(x))
      .map((x: any) => `${String(x.threatTag ?? "未知")}:${clampInt(x.turnsLeft, 0, 99)}`)
      .filter((s: string) => !s.endsWith(":0"))
      .slice(0, 4);
  }, [equippedWeapon]);

  const bagIds = useMemo(() => (Array.isArray(weaponBag) ? weaponBag.map((w) => w.id).filter(Boolean) : []).slice(0, 12), [weaponBag]);

  return (
    <div className="rounded-2xl border border-white/15 bg-white/5 p-4 shadow-[0_0_20px_rgba(0,0,0,0.35)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs tracking-widest text-slate-400">武器栏</div>
          <div className="mt-1 text-sm font-semibold text-slate-100">
            {hasWeapon ? "已装备" : "空槽"}
          </div>
        </div>
        <div className="text-[11px] text-slate-400">
          装备/卸下/更换均需消耗 <span className="font-mono text-amber-300">1</span> 回合
        </div>
      </div>

      {!hasWeapon ? (
        <div className="mt-3 rounded-xl border border-dashed border-white/15 bg-black/10 px-3 py-3">
          <div className="text-sm font-semibold text-slate-200">主手武器：未装备</div>
          <div className="mt-1 text-[11px] leading-relaxed text-slate-400">
            若你已有武器（武器背包），请使用“更换武器：{`<武器ID>`}”。若你有 C+ 道具，可去配电间锻造台进行武器化。
          </div>
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-white/10 bg-slate-900/20 px-3 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-base font-semibold text-white">{equippedWeapon?.name ?? "未知武器"}</div>
              <div className="mt-0.5 text-[11px] text-slate-400">{formatSourceLine(equippedWeapon)}</div>
            </div>
            <div className="shrink-0 rounded-full border border-amber-400/25 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-200">
              {repairableText}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-2">
              <div className="text-[10px] tracking-wider text-slate-500">属性要求</div>
              <div className="mt-0.5 text-[11px] font-semibold text-amber-200">{formatWeaponStatRequirements(equippedWeapon)}</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-2">
              <div className="text-[10px] tracking-wider text-slate-500">效果摘要</div>
              <div className="mt-0.5 text-[11px] font-semibold text-emerald-200">{formatEffectSummary(equippedWeapon)}</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-2">
              <div className="text-[10px] tracking-wider text-slate-500">稳定度</div>
              <div className="mt-0.5 font-mono text-sm font-bold text-cyan-300">{stability}/100</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-2">
              <div className="text-[10px] tracking-wider text-slate-500">污染</div>
              <div className={`mt-0.5 font-mono text-sm font-bold ${contamination >= 70 ? "text-rose-300" : contamination >= 40 ? "text-amber-200" : "text-slate-200"}`}>
                {contamination}/100
              </div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-2">
              <div className="text-[10px] tracking-wider text-slate-500">模组</div>
              <div className="mt-0.5 text-[11px] text-slate-200">{mods.length > 0 ? mods.join(" / ") : "无"}</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-2">
              <div className="text-[10px] tracking-wider text-slate-500">灌注</div>
              <div className="mt-0.5 text-[11px] text-slate-200">{infusions.length > 0 ? infusions.join(" / ") : "无"}</div>
            </div>
          </div>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                const ok = await copyText("卸下武器");
                setTip(ok ? "已复制指令：卸下武器（需耗费1回合）" : "复制失败，请手动输入：卸下武器");
                setTimeout(() => setTip(null), 2500);
              }}
              className="min-h-[40px] rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold text-slate-100 transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
              title="不会直接改状态；请在主界面提交该指令"
            >
              卸下（耗时1回合）
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                const hint = bagIds.length > 0 ? `更换武器：${bagIds[0]}` : "更换武器：<武器ID>";
                const ok = await copyText(hint);
                setTip(ok ? `已复制指令：${hint}（需耗费1回合）` : `复制失败，请手动输入：${hint}`);
                setTimeout(() => setTip(null), 2500);
              }}
              className="min-h-[40px] rounded-xl border border-indigo-300/25 bg-indigo-500/15 px-4 py-2 text-xs font-semibold text-indigo-100 transition hover:bg-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-40"
              title="不会直接改状态；请在主界面提交该指令"
            >
              更换（耗时1回合）
            </button>
          </div>
        </div>
      )}

      <div className="mt-3 rounded-xl border border-white/10 bg-black/10 px-3 py-2 text-[11px] text-slate-400">
        <div className="flex items-center justify-between gap-3">
          <span>武器背包</span>
          <span className="font-mono">{Array.isArray(weaponBag) ? weaponBag.length : 0}/24</span>
        </div>
        <div className="mt-1 line-clamp-2">
          {bagIds.length > 0 ? bagIds.join("，") : "无"}
        </div>
        <div className="mt-1 text-[10px] text-slate-500">
          有可武器化道具时：去「配电间」查看锻造台（不会在 UI 中直接合成）。
        </div>
      </div>

      {tip ? (
        <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
          {tip}
        </div>
      ) : null}
    </div>
  );
}

