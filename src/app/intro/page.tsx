import type { Metadata } from "next";
import type { AppPageDynamicProps } from "@/lib/next/pageDynamicProps";
import { unwrapPageDynamicOnServer } from "@/lib/next/pageDynamicProps";
import { IntroPageClient } from "./IntroPageClient";

export const metadata: Metadata = {
  title: "背景与规则",
  description: "了解「序章·暗月」的世界背景与生存规则，准备开始你的故事。",
};

export default async function IntroPage(props: AppPageDynamicProps) {
  await unwrapPageDynamicOnServer(props);
  return <IntroPageClient />;
}
