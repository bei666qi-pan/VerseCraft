import { VcSpinner } from "@/features/play/components/VcSpinner";
import { VerseCraftPaperMark } from "@/components/VerseCraftPaperFrame";

export default function Loading() {
  return (
    <main className="vc-state-page" aria-busy="true" aria-live="polite">
      <section className="vc-state-panel max-w-[22rem]">
        <VerseCraftPaperMark className="mx-auto h-14 w-14" />
        <div className="mt-7 flex justify-center">
          <VcSpinner size={38} strokeWidth={2.6} tone="blackblue" />
        </div>
        <p className="vc-reading-serif mt-5 text-[15px] tracking-[0.08em] text-vc-ink-soft">
          正在翻开下一页…
        </p>
      </section>
    </main>
  );
}
