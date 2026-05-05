import type { ReactNode } from "react";
import type { Viewport } from "next";

export const viewport: Viewport = {
  themeColor: "#020617",
  colorScheme: "dark",
};

export default function SettlementLayout({ children }: { children: ReactNode }) {
  return children;
}
