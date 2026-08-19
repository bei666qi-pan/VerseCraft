import type { Metadata } from "next";
import type { AppPageDynamicProps } from "@/lib/next/pageDynamicProps";
import { unwrapPageDynamicOnServer } from "@/lib/next/pageDynamicProps";
import { isXingniWorldEnabled } from "@/lib/worlds/catalog";
import { CreateCharacterForm } from "./CreateCharacterForm";

export const metadata: Metadata = {
  title: "文界工坊 VerseCraft · 角色创建 / Character Creation",
  description: "创建角色，进入序章·暗月或星逆·太初。 / Create a character for a VerseCraft world.",
};

export default async function CreatePage(props: AppPageDynamicProps) {
  await unwrapPageDynamicOnServer(props);
  return <CreateCharacterForm xingniEnabled={isXingniWorldEnabled()} />;
}
