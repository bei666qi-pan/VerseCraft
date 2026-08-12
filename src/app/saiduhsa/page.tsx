import { AdminShadowGate } from "@/components/admin/AdminShadowGate";
import AdminDashboardV2 from "@/components/admin/AdminDashboardV2";
import { requireAdminSession } from "@/lib/admin/authGuard";
import { unwrapPageDynamicOnServer, type AppPageDynamicProps } from "@/lib/next/pageDynamicProps";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ShadowAdminPage(props: AppPageDynamicProps) {
  await unwrapPageDynamicOnServer(props);
  const actor = await requireAdminSession();

  if (!actor) {
    return <AdminShadowGate />;
  }

  return (
    <AdminDashboardV2
      rows={[]}
      onlineCount={0}
      totalUsers={0}
      totalTokens={0}
      chartData={[]}
    />
  );
}
