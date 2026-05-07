"use client";

import { useRouter } from "next/navigation";
import { useGameStore, type EchoTalent } from "@/store/useGameStore";
import {
  VerseCraftPaperFrame,
  VerseCraftPaperMark,
  VerseCraftPaperPillButton,
} from "@/components/VerseCraftPaperFrame";
import type { AppPageDynamicProps } from "@/lib/next/pageDynamicProps";
import { useClientPageDynamicProps } from "@/lib/next/useClientPageDynamicProps";

const DEFAULT_STATS = {
  sanity: 10,
  agility: 8,
  luck: 8,
  charm: 7,
  background: 7,
};

export default function PreviewLandingPage(props: AppPageDynamicProps) {
  useClientPageDynamicProps(props);
  const router = useRouter();

  const isDev = process.env.NODE_ENV === "development";

  function handleStartTest() {
    useGameStore.getState().initCharacter(
      {
        name: "测试者",
        gender: "男",
        height: 170,
        personality: "谨慎",
      },
      DEFAULT_STATS,
      "命运馈赠" as EchoTalent
    );
    router.push("/preview/play");
  }

  if (!isDev) {
    return (
      <VerseCraftPaperFrame>
        <div className="flex min-h-[100dvh] items-center justify-center text-center">
          <p className="vc-reading-serif text-[1.35rem] text-[#4f625c]">用户预览仅在开发环境可用</p>
        </div>
      </VerseCraftPaperFrame>
    );
  }

  return (
    <VerseCraftPaperFrame>
      <div className="relative z-10 flex min-h-[100dvh] flex-col items-center justify-center text-center">
        <VerseCraftPaperMark className="mb-6 h-14 w-14" />
        <h1 className="vc-reading-serif text-[2rem] font-semibold leading-none text-[#0d5a4e]">
          用户界面 · 本地测试
        </h1>
        <p className="mt-4 max-w-sm text-sm leading-relaxed text-[#4f625c]">
          使用预设角色与天赋快速进入游戏，无需登录。仅用于开发调试。
        </p>
        <div className="mt-8 w-full max-w-sm">
          <VerseCraftPaperPillButton type="button" onClick={handleStartTest}>
            开始测试游戏
          </VerseCraftPaperPillButton>
        </div>
        <p className="mt-6 text-xs text-[#6f6a60]">
          预设：测试者 · 命运馈赠 · 属性均衡
        </p>
      </div>
    </VerseCraftPaperFrame>
  );
}
