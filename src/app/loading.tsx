import { VcSpinner } from "@/features/play/components/VcSpinner";

export default function Loading() {
  return (
    <main
      className="vc-state-page"
      aria-busy="true"
      aria-live="polite"
      data-testid="versecraft-loading-page"
    >
      <section className="vc-state-panel max-w-[22rem]">
        <div className="flex justify-center">
          <VcSpinner size={38} strokeWidth={2.6} tone="blackblue" />
        </div>
        <p className="vc-reading-serif mt-5 text-[15px] tracking-[0.08em] text-vc-ink-soft">
          正在翻开下一页…
        </p>
      </section>
    </main>
  );
}
