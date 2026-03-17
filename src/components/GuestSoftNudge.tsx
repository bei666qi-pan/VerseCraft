// src/components/GuestSoftNudge.tsx
"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useGameStore } from "@/store/useGameStore";

type GuestSoftNudgeProps = {
  context?: "play" | "settlement" | "global";
};

const THIRTY_MINUTES_SECONDS = 30 * 60;

export function GuestSoftNudge({ context = "global" }: GuestSoftNudgeProps) {
  // 避免在核心游戏界面长期遮挡视野：暂时关闭 /play 里的游客软提示
  if (context === "play") return null;

  const pathname = usePathname();

  const isGuest = useGameStore((s) => s.isGuest);
  const playTimeSeconds = useGameStore((s) => s.playTimeSeconds ?? 0);
  const visitCount = useGameStore((s) => s.visitCount ?? 0);
  const hasShownGuestSoftNudge = useGameStore((s) => s.hasShownGuestSoftNudge ?? false);

  const addPlayTimeSeconds = useGameStore((s) => s.addPlayTimeSeconds);
  const bumpVisitCount = useGameStore((s) => s.bumpVisitCount);
  const markGuestSoftNudgeShown = useGameStore((s) => s.markGuestSoftNudgeShown);

  const [visible, setVisible] = useState(false);

  // 记录访问次数：每次组件挂载视为一次打开游戏
  useEffect(() => {
    bumpVisitCount();
  }, [bumpVisitCount]);

  // 在 /play 页面累积游玩时长
  useEffect(() => {
    if (!isGuest) return;
    const inPlayRoute = pathname?.startsWith("/play");
    if (!inPlayRoute && context !== "play") return;

    const interval = window.setInterval(() => {
      addPlayTimeSeconds(5);
    }, 5000);

    return () => {
      window.clearInterval(interval);
    };
  }, [addPlayTimeSeconds, context, isGuest, pathname]);

  // 结算页面进入时立即触发一次检测
  useEffect(() => {
    if (!isGuest) return;
    if (context !== "settlement") return;
    if (hasShownGuestSoftNudge) return;

    setVisible(true);
    markGuestSoftNudgeShown();

    const timer = window.setTimeout(() => {
      setVisible(false);
    }, 2000);

    return () => window.clearTimeout(timer);
  }, [context, hasShownGuestSoftNudge, isGuest, markGuestSoftNudgeShown]);

  // 基于 playTime / visitCount 的全局触发
  useEffect(() => {
    if (!isGuest) return;
    if (hasShownGuestSoftNudge) return;

    const reachedPlayTime = playTimeSeconds >= THIRTY_MINUTES_SECONDS;
    const isSecondVisit = visitCount === 2;

    if (!reachedPlayTime && !isSecondVisit) return;

    setVisible(true);
    markGuestSoftNudgeShown();

    const timer = window.setTimeout(() => {
      setVisible(false);
    }, 2000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [hasShownGuestSoftNudge, isGuest, markGuestSoftNudgeShown, playTimeSeconds, visitCount]);

  if (!visible || !isGuest) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[120] flex items-center justify-center">
      <div className="pointer-events-none inline-flex max-w-md translate-y-0 transform items-center justify-center rounded-2xl bg-white/90 px-6 py-4 text-sm font-medium text-slate-800 shadow-2xl backdrop-blur-md transition-opacity duration-300">
        可注册账号以参与排行榜并进行云存档
      </div>
    </div>
  );
}

