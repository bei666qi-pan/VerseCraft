import { type ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "../../../auth";

export default async function PlayLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/");
  }
  return <>{children}</>;
}
