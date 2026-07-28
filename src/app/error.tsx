"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clearVersecraftStorage } from "@/lib/resilientStorage";
import { VerseCraftPaperDivider, VerseCraftPaperMark } from "@/components/VerseCraftPaperFrame";

// Next.js 部署后旧标签页仍持有旧构建里编译出的 Server Action 加密 ID，提交时服务端
// 报 "Failed to find Server Action ... older or newer deployment"（生产已实测反复出现，
// 常见于登录/提交类表单，例如 /saiduhsa 的 shadow 登录）。这类错误靠 reset() 重渲染
// 同一份旧 bundle 没用，必须整页硬刷新才能拿到新构建的 Server Action 清单。
function isStaleServerActionError(error: Error): boolean {
  return /Failed to find Server Action/i.test(error.message);
}

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const staleServerAction = isStaleServerActionError(error);

  useEffect(() => {
    console.error("[VerseCraft] Client error:", error);
  }, [error]);

  async function handleClearStorageAndHome() {
    await clearVersecraftStorage();
    router.push("/");
    router.refresh();
  }

  return (
    <main className="vc-state-page">
      <section className="vc-state-panel">
        <VerseCraftPaperMark className="mx-auto h-16 w-16" />
        <p className="vc-reading-serif mt-6 text-[12px] font-semibold tracking-[0.28em] text-vc-ink-faint">
          PAGE RECOVERY
        </p>
        <h1 className="vc-reading-serif mt-3 text-[clamp(1.8rem,7vw,2.25rem)] font-semibold leading-tight tracking-[-0.025em] text-vc-ink-deep">
          {staleServerAction ? "页面版本已更新" : "页面加载出错"}
        </h1>
        <VerseCraftPaperDivider className="mx-auto mt-5 w-[11rem]" />
        <p className="mx-auto mt-5 max-w-sm text-center text-sm leading-7 text-vc-ink-soft">
          {staleServerAction
            ? "站点刚刚更新过，当前页面还是更新前的旧版本，需要刷新一次才能继续操作。"
            : "页面渲染时发生异常。请尝试刷新；若反复出现，可清除本机缓存后重试。"}
        </p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => (staleServerAction ? window.location.reload() : reset())}
            className="vc-primary-action"
          >
            {staleServerAction ? "刷新页面" : "重试"}
          </button>
          <button
            type="button"
            onClick={handleClearStorageAndHome}
            className="vc-secondary-action"
          >
            清除缓存并返回
          </button>
        </div>
        <Link
          href="/"
          className="mt-6 inline-block text-sm text-vc-ink-faint underline-offset-4 transition hover:text-vc-ink hover:underline"
        >
          直接返回首页
        </Link>
      </section>
    </main>
  );
}
