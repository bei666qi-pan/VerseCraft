import { assetUrl } from "@/lib/config/publicRuntime";

export const INTRO_BRAND = "VerseCraft";
export const INTRO_PAGE_TITLE = "选择世界观";
export const INTRO_PAGE_SUBTITLE = "AI 互动叙事世界";
export const INTRO_CTA = "进入公寓";
export const INTRO_DISABLED_CTA = "世界观筹备中";

const DARKMOON_CARD_IMAGE_BASE = assetUrl("/assets/intro/darkmoon-card-4f0176bcea219a297458e2f65b940690");
export const DARKMOON_CARD_IMAGE = `${DARKMOON_CARD_IMAGE_BASE}.jpg`;
const XINGNI_CARD_IMAGE_BASE = assetUrl("/assets/intro/xingni-qingshi-card-119156d41d28583e94325ef25f4f761e");
export const XINGNI_CARD_IMAGE = `${XINGNI_CARD_IMAGE_BASE}.jpg`;

export type IntroWorldSlide = {
  id: string;
  worldId?: "dark_moon_prologue" | "xingni_taichu";
  ctaLabel?: string;
  title: string;
  subtitle: string;
  available: boolean;
  imageSrc?: string;
  /** 不含扩展名的路径前缀，用于拼出 avif/webp 多宽度档位。见 scripts/optimizeStaticImages.ts。 */
  imageBasePath?: string;
  imageAlt?: string;
  introTitle: string;
  introBody: readonly string[];
};

export const INTRO_WORLD_SLIDES = [
  {
    id: "darkmoon",
    worldId: "dark_moon_prologue",
    title: "序章 · 暗月",
    subtitle: "异常公寓生存叙事",
    available: true,
    imageSrc: DARKMOON_CARD_IMAGE,
    imageBasePath: DARKMOON_CARD_IMAGE_BASE,
    imageAlt: "序章暗月世界观卡片",
    introTitle: "序章 · 暗月",
    introBody: [
      "你醒在如月公寓 B1 的冷光之下，和月初又一批误入者一样——先证明自己能活过第一段走廊。",
      "这是一段 AI 驱动的悬疑互动小说：探索异常、交涉取舍、记录线索与关系债，一步步接近真正出口。十天不多，得学会用每一步换信息。",
    ],
  },
  {
    id: "xingni-taichu",
    worldId: "xingni_taichu",
    title: "星逆 · 太初",
    subtitle: "当前开放地图 · 青石县",
    ctaLabel: "踏入青石县",
    available: true,
    imageSrc: XINGNI_CARD_IMAGE,
    imageBasePath: XINGNI_CARD_IMAGE_BASE,
    imageAlt: "雨后青石县与远行散修，远山灵光映照升仙台",
    introTitle: "星逆 · 太初",
    introBody: [
      "太初浩土辽阔无边，青石县只是这座玄幻世界当前开放的第一处区域，而非世界全貌。",
      "你将以气海受损的炼气二层散修身份在此落脚：采集灵材、经营灵石、恢复修为，并以炼丹、炼器或战斗凭证叩响升仙台后的界门。",
    ],
  },
  {
    id: "blank-2",
    title: "未开放世界观",
    subtitle: "等待下一段故事",
    available: false,
    introTitle: "未开放世界观",
    introBody: ["这个世界观仍在筹备中。"],
  },
  {
    id: "blank-3",
    title: "未开放世界观",
    subtitle: "等待下一段故事",
    available: false,
    introTitle: "未开放世界观",
    introBody: ["这个世界观仍在筹备中。"],
  },
  {
    id: "blank-4",
    title: "未开放世界观",
    subtitle: "等待下一段故事",
    available: false,
    introTitle: "未开放世界观",
    introBody: ["这个世界观仍在筹备中。"],
  },
] as const satisfies readonly IntroWorldSlide[];

export const INTRO_TITLE = INTRO_WORLD_SLIDES[0].title;
export const INTRO_PARAGRAPHS = INTRO_WORLD_SLIDES[0].introBody;
