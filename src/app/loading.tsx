import { VcSpinner } from "@/features/play/components/VcSpinner";

export default function Loading() {
  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center bg-[#f7f3ec] text-[#164f4d]"
      aria-busy="true"
      aria-live="polite"
    >
      <VcSpinner size={44} strokeWidth={3} tone="blackblue" />
      <p className="vc-reading-serif mt-6 text-sm tracking-wide text-[#4f625c]">
        正在翻开下一页…
      </p>
    </main>
  );
}
