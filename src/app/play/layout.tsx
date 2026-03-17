// src/app/play/layout.tsx
import { type ReactNode } from "react";
import { auth } from "../../../auth";
import { PlayAuthGuard } from "@/components/PlayAuthGuard";
import { GuestSoftNudge } from "@/components/GuestSoftNudge";

export default async function PlayLayout({ children }: { children: ReactNode }) {
  return (
    <PlayAuthGuard authorized={true}>
      {children}
      <GuestSoftNudge context="play" />
    </PlayAuthGuard>
  );
}
