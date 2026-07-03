export default function Loading() {
  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center bg-[#f7f3ec] text-[#164f4d]"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="flex items-center gap-2" aria-hidden="true">
        <span className="h-2 w-2 animate-pulse rounded-full bg-[#244f45]" />
        <span className="h-2 w-2 animate-pulse rounded-full bg-[#244f45] [animation-delay:150ms]" />
        <span className="h-2 w-2 animate-pulse rounded-full bg-[#244f45] [animation-delay:300ms]" />
      </div>
      <p className="vc-reading-serif mt-5 text-sm tracking-wide text-[#4f625c]">
        正在翻开下一页…
      </p>
    </main>
  );
}
