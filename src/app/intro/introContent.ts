export const INTRO_BRAND = "VerseCraft";
export const INTRO_PAGE_TITLE = "选择世界观";
export const INTRO_PAGE_SUBTITLE = "不同的世界，不同的故事";
export const INTRO_CTA = "书写想象";
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
    subtitle: "被困于暗月循环中的封闭公寓",
    available: true,
    imageSrc: DARKMOON_CARD_IMAGE,
    imageAlt: "序章暗月世界观卡片",
    introTitle: "序章 · 暗月",
    introBody: [
      "你醒在如月公寓 B1 的冷光之下，时间与空间开始出现轻微错位。",
      "这是一座被暗月循环困住的封闭公寓。你需要观察异常、记录线索，并用自己的行动把故事继续写下去。",
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
