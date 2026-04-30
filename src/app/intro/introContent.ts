export const INTRO_BRAND = "VerseCraft";
export const INTRO_PAGE_TITLE = "选择世界观";
export const INTRO_PAGE_SUBTITLE = "AI 悬疑互动小说";
export const INTRO_CTA = "进入公寓";
export const INTRO_DISABLED_CTA = "世界观筹备中";

export const DARKMOON_CARD_IMAGE =
  "/assets/intro/darkmoon-card-4547bc8069598bf27bca2e919033e05f.jpg";

export type IntroWorldSlide = {
  id: string;
  title: string;
  subtitle: string;
  available: boolean;
  imageSrc?: string;
  imageAlt?: string;
  introTitle: string;
  introBody: readonly string[];
};

export const INTRO_WORLD_SLIDES = [
  {
    id: "darkmoon",
    title: "序章 · 暗月",
    subtitle: "异常公寓生存叙事",
    available: true,
    imageSrc: DARKMOON_CARD_IMAGE,
    imageAlt: "序章暗月世界观卡片",
    introTitle: "序章 · 暗月",
    introBody: [
      "你醒在如月公寓 B1 的冷光之下，和月初又一批误入者一样，先要证明自己能活过第一段走廊。",
      "这是一段 AI 驱动的悬疑互动小说。你需要探索异常、交涉取舍、记录线索与关系债，一步步接近真正出口。",
    ],
  },
  {
    id: "blank-1",
    title: "未开放世界观",
    subtitle: "等待下一段故事",
    available: false,
    introTitle: "未开放世界观",
    introBody: ["这个世界观仍在筹备中。"],
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
