import type { AppPageDynamicProps } from "@/lib/next/pageDynamicProps";
import { unwrapPageDynamicOnServer } from "@/lib/next/pageDynamicProps";
import { CreateCharacterForm } from "./CreateCharacterForm";

export default async function CreatePage(props: AppPageDynamicProps) {
  await unwrapPageDynamicOnServer(props);
  return <CreateCharacterForm />;
}
