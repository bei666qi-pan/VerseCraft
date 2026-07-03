// src/app/play/layout.tsx
import type { Metadata } from "next";
import { type ReactNode } from "react";
import { PlayAuthGuard } from "@/components/PlayAuthGuard";
import { GuestSoftNudge } from "@/components/GuestSoftNudge";

export const metadata: Metadata = {
  title: "游玩中",
  description: "序章·暗月——用你的行动书写这一夜的走向。",
};

export default async function PlayLayout({ children }: { children: ReactNode }) {
  return (
    <PlayAuthGuard authorized={true}>
      {children}
      <GuestSoftNudge context="play" />
    </PlayAuthGuard>
  );
}
