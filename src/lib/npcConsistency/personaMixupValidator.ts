import { getNpcCanonicalIdentity } from "@/lib/registry/npcCanon";

export type PersonaMixupHit = {
  victimNpcId: string;
  leakedFromNpcId: string;
  kind: "appearance" | "speech" | "role";
  token: string;
};

function normalizeId(id: string): string {
  return String(id ?? "").trim().replace(/^n-(\d{3})$/i, "N-$1").toUpperCase();
}

function windowAround(text: string, idx: number, radius: number): string {
  const s = Math.max(0, idx - radius);
  const e = Math.min(text.length, idx + radius);
  return text.slice(s, e);
}

const HIGH_RISK_SIGNATURES: Record<string, { appearance: string[]; speech: string[]; role: string[] }> = {
  // 洗衣房阿姨：强“后勤/洗晾/床单/摇篮曲”特征
  "N-014": {
    appearance: ["床单", "洗衣机", "洗衣粉", "漂白", "围裙", "折叠", "晾", "水洗", "洗不干净"],
    speech: ["阿姨", "小调", "摇篮曲", "哼", "慢慢来", "别慌"],
    role: ["洗衣房", "后勤", "晾衣", "洗衣", "漂白剂"],
  },
  // 灵伤：强“补给台/制服/笑容亮/轻快比喻”特征
  "N-020": {
    appearance: ["制服", "笑容", "补给", "货架", "台面"],
    speech: ["上扬", "可爱", "像", "呀", "呢"],
    role: ["补给", "售卖", "生活引导", "步骤"],
  },
};

function findNpcName(npcId: string): string {
  const canon = getNpcCanonicalIdentity(npcId);
  return canon.canonicalName || canon.npcId;
}

export function detectPersonaMixup(args: {
  narrative: string;
  presentNpcIds: string[];
  focusNpcId: string | null;
}): { hits: PersonaMixupHit[] } {
  const narrative = String(args.narrative ?? "");
  const present = new Set((args.presentNpcIds ?? []).map(normalizeId));
  const candidates = new Set<string>();
  if (args.focusNpcId) candidates.add(normalizeId(args.focusNpcId));
  for (const id of present) candidates.add(id);
  // Only check a small subset for cost control.
  const npcIds = [...candidates].filter((id) => id in HIGH_RISK_SIGNATURES).slice(0, 6);
  const hits: PersonaMixupHit[] = [];

  for (const victim of npcIds) {
    const victimName = findNpcName(victim);
    const idx = narrative.indexOf(victimName);
    if (idx === -1) continue;
    const local = windowAround(narrative, idx, 220);
    for (const leakedFrom of npcIds) {
      if (leakedFrom === victim) continue;
      const sig = HIGH_RISK_SIGNATURES[leakedFrom];
      const check = (kind: PersonaMixupHit["kind"], tokens: string[]) => {
        for (const tk of tokens) {
          if (local.includes(tk)) {
            hits.push({ victimNpcId: victim, leakedFromNpcId: leakedFrom, kind, token: tk });
            return;
          }
        }
      };
      check("appearance", sig.appearance);
      check("speech", sig.speech);
      check("role", sig.role);
    }
  }
  return { hits };
}

export function rewritePersonaMixupConservatively(args: {
  narrative: string;
  hits: PersonaMixupHit[];
}): { narrative: string; changed: boolean } {
  const src = String(args.narrative ?? "");
  if (!src || args.hits.length === 0) return { narrative: src, changed: false };
  let out = src;
  // Conservative: only scrub the leaked token itself.
  for (const h of args.hits.slice(0, 6)) {
    // Do not blanket-replace everywhere; just replace first occurrence to reduce collateral damage.
    const re = new RegExp(h.token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    out = out.replace(re, "（略）");
  }
  // Light cosmetic cleanup: remove repeated placeholders.
  out = out.replace(/（略）(?:\s*（略）)+/g, "（略）");
  return { narrative: out, changed: out !== src };
}

