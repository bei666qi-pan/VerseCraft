import type { StatType } from "@/lib/registry/types";
import type { EchoTalent } from "@/store/useGameStore";

export const MAX_INPUT = 20;

export const COMPLIANCE_HINT_TEXT =
  "本平台为AI协作创意写作工具，请创作者遵守中国法律法规，严禁输入或引导生成涉黄、涉政、涉暴等违规内容。";

export const TALENT_EFFECT_STYLE: Record<EchoTalent, { bg: string; anim: string }> = {
  时间回溯: {
    bg: "radial-gradient(ellipse 90% 90% at 50% 50%, transparent 30%, rgba(6,182,212,0.2) 60%, rgba(8,145,178,0.4) 100%)",
    anim: "talent-rewind 1.4s ease-out forwards",
  },
  命运馈赠: {
    bg: "radial-gradient(ellipse 85% 85% at 50% 50%, transparent 25%, rgba(245,158,11,0.25) 55%, rgba(217,119,6,0.5) 100%)",
    anim: "talent-gift 1.4s ease-out forwards",
  },
  主角光环: {
    bg: "radial-gradient(ellipse 70% 70% at 50% 50%, transparent 50%, rgba(253,224,71,0.15) 75%, rgba(250,204,21,0.35) 100%)",
    anim: "talent-halo 1.4s ease-out forwards",
  },
  生命汇源: {
    bg: "radial-gradient(ellipse 88% 88% at 50% 50%, transparent 35%, rgba(34,197,94,0.2) 65%, rgba(22,163,74,0.45) 100%)",
    anim: "talent-life 1.4s ease-out forwards",
  },
  洞察之眼: {
    bg: "radial-gradient(ellipse 85% 85% at 50% 50%, transparent 30%, rgba(139,92,246,0.2) 60%, rgba(124,58,237,0.45) 100%)",
    anim: "talent-insight 1.4s ease-out forwards",
  },
  丧钟回响: {
    bg: "radial-gradient(ellipse 90% 90% at 50% 50%, transparent 20%, rgba(120,0,0,0.25) 55%, rgba(70,0,0,0.6) 100%)",
    anim: "talent-deathbell 1.4s ease-out forwards",
  },
};

export const STAT_ORDER: StatType[] = ["sanity", "agility", "luck", "charm", "background"];

export const STAT_LABELS: Record<StatType, string> = {
  sanity: "精神锚点",
  agility: "思维敏锐度",
  luck: "灵感直觉",
  charm: "表达感染力",
  background: "创作底色",
};

export const FALLBACK_STATS: Record<StatType, number> = {
  sanity: 10,
  agility: 0,
  luck: 0,
  charm: 0,
  background: 0,
};

export const STAT_MAX = 50;
