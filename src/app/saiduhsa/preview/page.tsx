import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** No mock data; redirect to real admin gate. */
export default function AdminPreviewPage() {
  redirect("/saiduhsa");
}
