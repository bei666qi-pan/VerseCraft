import type { Metadata } from "next";
import { sanitizePreviewAccessNext } from "@/lib/previewAccess";
import type { AppPageDynamicProps } from "@/lib/next/pageDynamicProps";
import { PreviewAccessForm } from "./PreviewAccessForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "预览站访问验证",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function PreviewAccessPage(props: AppPageDynamicProps) {
  const searchParams = await (props.searchParams ?? Promise.resolve({}));
  const nextParam = Array.isArray(searchParams.next) ? searchParams.next[0] : searchParams.next;
  const nextPath = sanitizePreviewAccessNext(nextParam);

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#030712] px-5 py-10 text-slate-100">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_24%_20%,rgba(34,211,238,0.14),transparent_34%),radial-gradient(circle_at_76%_22%,rgba(148,163,184,0.12),transparent_32%),linear-gradient(135deg,rgba(8,13,28,0.95),rgba(2,6,23,1))]" />
      <div className="absolute inset-x-0 top-0 h-px bg-cyan-200/25" />
      <PreviewAccessForm nextPath={nextPath} />
    </main>
  );
}
