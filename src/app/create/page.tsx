import type { Metadata } from "next";
import type { AppPageDynamicProps } from "@/lib/next/pageDynamicProps";
import { unwrapPageDynamicOnServer } from "@/lib/next/pageDynamicProps";
import { CreateCharacterForm } from "./CreateCharacterForm";

export const metadata: Metadata = {
  title: "角色创建",
  description: "分配属性、选择天赋，塑造将踏入异常公寓的角色。",
};

export default async function CreatePage(props: AppPageDynamicProps) {
  await unwrapPageDynamicOnServer(props);
  return <CreateCharacterForm />;
}
