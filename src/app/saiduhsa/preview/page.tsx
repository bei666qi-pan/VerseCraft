import { redirect } from "next/navigation";
import { unwrapPageDynamicOnServer, type AppPageDynamicProps } from "@/lib/next/pageDynamicProps";

/** No mock data; redirect to real admin gate. */
export default async function AdminPreviewPage(props: AppPageDynamicProps) {
  await unwrapPageDynamicOnServer(props);
  redirect("/saiduhsa");
}
