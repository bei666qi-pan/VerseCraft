"use client";

import { memo, type ReactNode } from "react";
import { LOCATION_LABELS } from "./locationLabels";

export const BLOOD_MARKER = "{{BLOOD}}";
export const BLOOD_END = "{{/BLOOD}}";

export function applyBloodErase(narrative: string): string {
  const parts = narrative.split(/([。！？\n]+)/);
  const sentences: string[] = [];
  let buf = "";
  for (const p of parts) {
    if (/^[。！？\n]+$/.test(p)) {
      if (buf.trim()) sentences.push(buf + p);
      buf = "";
    } else {
      buf += p;
    }
  }
  if (buf.trim()) sentences.push(buf);
  const meaningful = sentences.filter((s) => s.trim().length > 4);
  if (meaningful.length < 2) return narrative;
  const startIdx = Math.min(
    Math.floor(Math.random() * (meaningful.length - 1)),
    meaningful.length - 2
  );
  const s0 = meaningful[startIdx];
  const s1 = meaningful[startIdx + 1];
  const idx0 = narrative.indexOf(s0);
  const idx1 = narrative.indexOf(s1, idx0);
  if (idx0 === -1 || idx1 === -1) return narrative;
  const end = idx1 + s1.length;
  return `${narrative.slice(0, idx0)}${BLOOD_MARKER}${narrative.slice(idx0, end)}${BLOOD_END}${narrative.slice(end)}`;
}

export function renderNarrativeText(text: string, options?: { plainOnly?: boolean }): ReactNode {
  try {
    const safeText = typeof text === "string" ? text.slice(0, 15000) : "";
    const plainOnly = options?.plainOnly ?? false;
    const localized = (() => {
      try {
        if (!safeText) return safeText;
        const normalizePlatformWords = (s: string) => {
          let out = s;
          out = out.replace(/游戏玩法/g, "创作设定");
          out = out.replace(/游戏/g, "创作");
          out = out.replace(/属性面板/g, "叙事维度");
          out = out.replace(/属性/g, "叙事维度");
          out = out.replace(/加点/g, "潜能赋予");
          out = out.replace(/理智值\/生命值|理智值|生命值|理智/g, "精神锚点");
          out = out.replace(/敏捷/g, "思维敏锐度");
          out = out.replace(/幸运/g, "灵感直觉");
          out = out.replace(/战斗力/g, "剧情张力");
          out = out.replace(/背包|行囊|道具/g, "灵感手记");
          out = out.replace(/使用道具/g, "消耗灵感");
          return out;
        };
        const base = normalizePlatformWords(safeText);
        const keys = Object.keys(LOCATION_LABELS ?? {});
        if (keys.length === 0) return safeText;
        keys.sort((a, b) => b.length - a.length);
        let out = base;
        for (const k of keys) {
          const zh = LOCATION_LABELS[k];
          if (!zh) continue;
          out = out.split(k).join(zh);
        }
        return out;
      } catch {
        return safeText;
      }
    })();
    const normalized = localized
      .replace(/\{\{blood\}\}/gi, "{{BLOOD}}")
      .replace(/\{\{\/blood\}\}/gi, "{{/BLOOD}}");
    const stripOrphans = (s: string) =>
      s.replace(/\{\{BLOOD\}\}/g, "").replace(/\{\{\/BLOOD\}\}/g, "").replace(/\^\^/g, "").replace(/\*\*/g, "");
    if (plainOnly) {
      const plain = normalized
        .replace(/\*\*([^*]*)\*\*/g, "$1")
        .replace(/\^\^([^^]*)\^\^/g, "$1")
        .replace(/\{\{BLOOD\}\}([\s\S]*?)\{\{\/BLOOD\}\}/g, "$1");
      return <span>{stripOrphans(plain)}</span>;
    }
    const parts = normalized.split(/(\*\*[^*]*\*\*|\^\^[^^]*\^\^|\{\{BLOOD\}\}[\s\S]*?\{\{\/BLOOD\}\})/g);
    return parts.map((part, i) => {
      const m = part.match(/^\*\*(.+)\*\*$/);
      if (m)
        return (
          <strong
            key={i}
            className="inline-block font-bold text-red-600 animate-glitch drop-shadow-[0_0_8px_rgba(220,38,38,0.8)]"
          >
            {m[1]}
          </strong>
        );
      const blood = part.match(/^\{\{BLOOD\}\}([\s\S]*)\{\{\/BLOOD\}\}$/);
      if (blood)
        return (
          <span key={i} className="relative inline-block">
            <span className="relative z-0 text-inherit opacity-30">{blood[1]}</span>
            <span
              className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-br from-red-900/85 via-red-800/80 to-red-950/90 mix-blend-multiply"
              style={{ borderRadius: "2px" }}
              aria-hidden
            />
          </span>
        );
      return <span key={i}>{stripOrphans(part)}</span>;
    });
  } catch {
    return <span>{typeof text === "string" ? text.slice(0, 500) : ""}</span>;
  }
}

export function extractGreenTips(text: string): string[] {
  if (typeof text !== "string" || !text.includes("^^")) return [];
  const tips: string[] = [];
  const seen = new Set<string>();
  const regex = /\^\^([\s\S]*?)\^\^/g;
  const normalizeTip = (input: string): string => {
    return input
      .replace(/\s+/g, "")
      .replace(/[，。、“”‘’：；！？,.!?:;'"()（）【】\[\]—\-]/g, "")
      .replace(/属性面板|属性|加点/g, "潜能赋予")
      .replace(/理智值\/生命值|理智值|理智|生命值/g, "精神锚点")
      .replace(/选项输入切换为手动输入|将选项切换为手动输入|切换到手动输入/g, "手动输入")
      .replace(/回理智|恢复理智|回精神锚点|恢复精神锚点/g, "回精神锚点")
      .trim();
  };
  const MANUAL_INPUT_COMPLIANCE_KEY =
    "你可以选择手动输入自由书写你的意志若手动输入不可能的事情则会被抹杀原石可在设置中用于潜能赋予或回精神锚点";
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const tip = match[1]?.trim();
    if (!tip) continue;
    const key = normalizeTip(tip);
    if (!key) continue;
    const isManualInputComplianceTip =
      key.includes("手动输入") &&
      key.includes("不可能") &&
      key.includes("抹杀") &&
      key.includes("原石") &&
      key.includes("潜能赋予") &&
      key.includes("精神锚点");
    const dedupeKey = isManualInputComplianceTip ? MANUAL_INPUT_COMPLIANCE_KEY : key;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    tips.push(tip);
  }
  return tips;
}

export const DMNarrativeBlock = memo(function DMNarrativeBlock({
  content,
  isDarkMoon,
  isLowSanity,
}: {
  content: string;
  isDarkMoon: boolean;
  isLowSanity?: boolean;
}) {
  const safeContent = typeof content === "string" ? content : "";
  const baseClass = isLowSanity
    ? "space-y-6 leading-[1.8] tracking-wide text-[18px] text-white"
    : isDarkMoon
      ? "space-y-6 leading-[1.8] tracking-wide text-[18px] text-slate-200"
      : "space-y-6 leading-[1.8] tracking-wide text-[18px] text-slate-800";
  let paras: string[] = [];
  try {
    paras = safeContent.split(/\n\n+/).filter(Boolean);
  } catch {
    paras = [safeContent];
  }
  return (
    <div className={`${baseClass} whitespace-pre-wrap`}>
      {paras.length > 1 ? (
        paras.map((p, i) => (
          <p key={i} className="whitespace-pre-wrap">
            {renderNarrativeText(p)}
          </p>
        ))
      ) : (
        <>{renderNarrativeText(safeContent)}</>
      )}
    </div>
  );
});
