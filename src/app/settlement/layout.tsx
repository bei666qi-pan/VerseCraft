import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "结算",
  description: "回顾这一段旅程的结局与得失。",
};

export const viewport: Viewport = {
  themeColor: "#f7f3ec",
  colorScheme: "light",
};

export default function SettlementLayout({ children }: { children: ReactNode }) {
  return children;
}
