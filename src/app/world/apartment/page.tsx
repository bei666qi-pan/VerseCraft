import { unwrapPageDynamicOnServer, type AppPageDynamicProps } from "@/lib/next/pageDynamicProps";

export default async function ApartmentPage(props: AppPageDynamicProps) {
  await unwrapPageDynamicOnServer(props);
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-2xl font-bold">公寓档案</h1>
    </main>
  );
}
