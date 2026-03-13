"use client";

import { useRouter } from "next/navigation";
import { useGameStore, type EchoTalent } from "@/store/useGameStore";
import { GlassCtaButton } from "@/components/GlassCtaButton";

const DEFAULT_STATS = {
  sanity: 10,
  agility: 8,
  luck: 8,
  charm: 7,
  background: 7,
};

export default function PreviewLandingPage() {
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
      <main className="flex min-h-screen items-center justify-center bg-slate-900 text-white">
        <p className="text-slate-400">玩家预览仅在开发环境可用</p>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-slate-50 px-4 text-slate-800">
      <div className="relative z-10 max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-widest text-slate-800">
          玩家界面 · 本地测试
        </h1>
        <p className="mt-3 text-sm text-slate-600">
          使用预设角色与天赋快速进入游戏，无需登录。仅用于开发调试。
        </p>
        <div className="mt-8">
          <GlassCtaButton label="开始测试游戏" onClick={handleStartTest} />
        </div>
        <p className="mt-6 text-xs text-slate-500">
          预设：测试者 · 命运馈赠 · 属性均衡
        </p>
      </div>
    </main>
  );
}
