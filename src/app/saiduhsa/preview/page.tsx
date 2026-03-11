import AdminDashboardClient from "@/components/admin/AdminDashboardClient";

export const dynamic = "force-dynamic";

const MOCK_ROWS = [
  {
    id: "demo-1",
    name: "demo_user_1",
    tokensUsed: 125000,
    todayTokensUsed: 8500,
    playTime: 7200,
    todayPlayTime: 1800,
    lastActive: new Date().toISOString(),
    isOnline: 1,
    feedbackPreview: "体验不错",
    feedbackContent: "体验不错，剧情很有代入感",
    feedbackCreatedAt: new Date().toISOString(),
  },
  {
    id: "demo-2",
    name: "demo_user_2",
    tokensUsed: 89000,
    todayTokensUsed: 0,
    playTime: 5400,
    todayPlayTime: 0,
    lastActive: new Date(Date.now() - 86400000).toISOString(),
    isOnline: 0,
    feedbackPreview: "",
    feedbackContent: "",
    feedbackCreatedAt: null,
  },
];

const MOCK_CHART_DATA = [
  { date: "03-08", users: 5, tokens: 120000, activeUsers: 3 },
  { date: "03-09", users: 8, tokens: 280000, activeUsers: 5 },
  { date: "03-10", users: 12, tokens: 450000, activeUsers: 8 },
  { date: "03-11", users: 15, tokens: 620000, activeUsers: 10 },
];

export default async function AdminPreviewPage() {
  if (process.env.NODE_ENV !== "development") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-900 text-white">
        <p className="text-slate-400">本地预览仅在开发环境可用</p>
      </main>
    );
  }

  return (
    <AdminDashboardClient
      metrics={{
        cpuLoadPercent: 12.5,
        memoryUsagePercent: 62.3,
        onlineCapacityEstimate: 24,
      }}
      rows={MOCK_ROWS}
      onlineCount={1}
      totalUsers={15}
      totalTokens={620000}
      chartData={MOCK_CHART_DATA}
    />
  );
}
