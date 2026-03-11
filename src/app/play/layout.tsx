import { type ReactNode } from "react";
import { auth } from "../../../auth";
import { PlayAuthGuard } from "@/components/PlayAuthGuard";

export default async function PlayLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  const authorized = Boolean(session?.user?.id);
  return <PlayAuthGuard authorized={authorized}>{children}</PlayAuthGuard>;
}
