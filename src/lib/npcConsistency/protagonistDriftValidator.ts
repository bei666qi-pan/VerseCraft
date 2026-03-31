type ProtagonistProfile = {
  name: string;
  gender: string;
  heightCm: number | null;
  personality: string;
  currentProfession: string;
};

function clampText(s: string, max: number): string {
  const t = String(s ?? "").trim();
  if (!t) return "";
  return t.length <= max ? t : t.slice(0, max);
}

function maskQuotedChineseDialogue(text: string): { masked: string } {
  const chars = [...String(text ?? "")];
  let inQuote = false;
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i] ?? "";
    if (c === "“") {
      inQuote = true;
      continue;
    }
    if (c === "”") {
      inQuote = false;
      continue;
    }
    if (inQuote) chars[i] = " ";
  }
  return { masked: chars.join("") };
}

function parseProfileFromPlayerContext(playerContext: string): ProtagonistProfile {
  const src = String(playerContext ?? "");
  const m = src.match(/用户档案：姓名\[([^\]]*)]，性别\[([^\]]*)]，身高\[([0-9]+)cm]，性格\[([^\]]*)]。/);
  const prof = src.match(/职业状态：当前\[([^\]]*)]/);
  const height = Number.parseInt(m?.[3] ?? "", 10);
  return {
    name: String(m?.[1] ?? "").trim(),
    gender: String(m?.[2] ?? "").trim(),
    heightCm: Number.isFinite(height) ? height : null,
    personality: String(m?.[4] ?? "").trim(),
    currentProfession: String(prof?.[1] ?? "").trim(),
  };
}

const SELF_NAME_RE = /我叫([^\n\r。！？]{1,8})/;
const BACKGROUND_CLAIM_RE =
  /(?:其实|原来|我一直|我本来|我曾经)\s*(?:是|在)\s*(?:警察|军人|医生|研究员|侦探|特工|记者|老师|教授|干员|审讯员|神父|道士|术士|猎人)/;
const SECRET_ORG_RE = /(?:组织|部门|单位|局里|总部|上级|档案室|机密|代号|任务编号|行动组)/;
const RELATION_CLAIM_RE =
  /(?:我和|我与)(?:N-\d{3}|[一-龥]{1,6})(?:是|早就|一直)\s*(?:恋人|情侣|兄弟|姐妹|同僚|战友|旧识|同学|同事|上司|下属)/;
const SUPERPOWER_RE = /(?:我的能力|我能)\s*(?:读心|预言|操控|瞬移|隐身|治愈|召唤|时间停止|回到过去)/;

function looksLikeDrift(maskedNarrative: string, profile: ProtagonistProfile): { hit: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const mName = maskedNarrative.match(SELF_NAME_RE);
  if (mName?.[1]) {
    const said = String(mName[1] ?? "").trim();
    if (said && profile.name && said !== profile.name) reasons.push(`name_claim:${said}`);
  }
  if (BACKGROUND_CLAIM_RE.test(maskedNarrative)) reasons.push("background_claim_role");
  if (RELATION_CLAIM_RE.test(maskedNarrative)) reasons.push("relationship_claim");
  if (SUPERPOWER_RE.test(maskedNarrative)) reasons.push("superpower_claim");
  // Only treat "secret org" as drift when coupled with strong first-person claim patterns.
  if (/(?:我\s*(?:隶属|来自|奉命|被派|受命)|我的上级)/.test(maskedNarrative) && SECRET_ORG_RE.test(maskedNarrative)) {
    reasons.push("secret_org_claim");
  }
  return { hit: reasons.length > 0, reasons };
}

function conservativeRewrite(narrative: string, profile: ProtagonistProfile): string {
  const base = String(narrative ?? "").trim();
  if (!base) return base;
  // Remove direct self-redefinition phrases outside quotes by softening them into uncertainty.
  let t = base;
  t = t.replace(SELF_NAME_RE, () => "我下意识想报出名字，却把话咽回去");
  t = t.replace(BACKGROUND_CLAIM_RE, "我脑海里掠过一个荒唐的念头");
  t = t.replace(RELATION_CLAIM_RE, "我不敢确认自己是否认错了人");
  t = t.replace(SUPERPOWER_RE, "我不敢把那种错觉当成能力");
  // Add a small anchor reminder, keep immersive (no dev text).
  const anchorLine = [
    profile.name ? `我记得自己叫${profile.name}。` : "",
    profile.currentProfession && profile.currentProfession !== "无" ? `至少此刻，我只能按“${profile.currentProfession}”的方式活下去。` : "",
  ]
    .filter(Boolean)
    .join("");
  if (anchorLine && !t.includes(anchorLine) && t.length < 49_000) {
    t = `${t}\n\n${anchorLine}`;
  }
  return clampText(t, 50_000);
}

export function applyProtagonistDriftPostGeneration(args: {
  narrative: string;
  playerContext: string | null;
}): { narrative: string; triggered: boolean; reasons: string[] } {
  const src = String(args.narrative ?? "");
  const pc = String(args.playerContext ?? "").trim();
  if (!src.trim() || !pc) return { narrative: src, triggered: false, reasons: [] };
  const profile = parseProfileFromPlayerContext(pc);
  const { masked } = maskQuotedChineseDialogue(src);
  const hit = looksLikeDrift(masked, profile);
  if (!hit.hit) return { narrative: src, triggered: false, reasons: [] };
  return {
    narrative: conservativeRewrite(src, profile),
    triggered: true,
    reasons: hit.reasons,
  };
}

