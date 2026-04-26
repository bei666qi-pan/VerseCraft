import type { AppPageDynamicProps } from "@/lib/next/pageDynamicProps";
import { unwrapPageDynamicOnServer } from "@/lib/next/pageDynamicProps";
import { IntroPageClient } from "./IntroPageClient";

export default async function IntroPage(props: AppPageDynamicProps) {
  await unwrapPageDynamicOnServer(props);
  return <IntroPageClient />;
}
