import { AdminShadowGate } from "@/components/admin/AdminShadowGate";
import AdminConsole from "@/components/admin/AdminConsole";
import { ensureRuntimeSchema } from "@/db/ensureSchema";
import { requireAdminSession } from "@/lib/admin/authGuard";
import { unwrapPageDynamicOnServer, type AppPageDynamicProps } from "@/lib/next/pageDynamicProps";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminPage(props: AppPageDynamicProps) {
  await unwrapPageDynamicOnServer(props);
  const actor = await requireAdminSession();

  if (!actor) {
    return <AdminShadowGate />;
  }

  try {
    await ensureRuntimeSchema();
  } catch (e) {
    console.warn("[admin] ensureRuntimeSchema best-effort failed", e);
  }

  return <AdminConsole />;
}
