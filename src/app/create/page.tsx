import type { Metadata } from "next";
import type { AppPageDynamicProps } from "@/lib/next/pageDynamicProps";
import { unwrapPageDynamicOnServer } from "@/lib/next/pageDynamicProps";
import { CreateCharacterForm } from "./CreateCharacterForm";

export const metadata: Metadata = {
  title: "文界工坊 VerseCraft · 角色创建 / Character Creation",
  description: "分配属性并选择天赋，进入异变公寓。 / Choose attributes and a talent before entering the strange apartment.",
};

export default async function CreatePage(props: AppPageDynamicProps) {
  await unwrapPageDynamicOnServer(props);
  return <CreateCharacterForm />;
}
