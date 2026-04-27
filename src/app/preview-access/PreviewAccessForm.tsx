"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  authenticatePreviewAccess,
  type PreviewAccessAuthState,
} from "@/app/actions/previewAccess";

const INITIAL_STATE: PreviewAccessAuthState = { ok: false };

export function PreviewAccessForm({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(authenticatePreviewAccess, INITIAL_STATE);

  useEffect(() => {
    if (state.ok) {
      router.replace(state.next ?? nextPath);
    }
  }, [nextPath, router, state.next, state.ok]);

  return (
    <form
      action={formAction}
      className="relative z-10 w-full max-w-md rounded-lg border border-cyan-100/15 bg-slate-950/70 p-7 shadow-[0_24px_100px_rgba(8,47,73,0.42)] backdrop-blur-2xl"
    >
      <input type="hidden" name="next" value={nextPath} />
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-cyan-200/70">
          VerseCraft
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-normal text-slate-50">
          预览站访问验证
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          这是受保护的预览环境，请输入访问密码。
        </p>
      </div>

      <label className="mt-7 block text-sm font-medium text-slate-200" htmlFor="preview-password">
        访问密码
      </label>
      <input
        id="preview-password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        className="mt-2 w-full rounded-lg border border-white/15 bg-black/35 px-4 py-3 text-sm text-slate-50 outline-none transition placeholder:text-slate-500 focus:border-cyan-300/70 focus:bg-black/50"
        placeholder="请输入预览访问密码"
      />

      {state.error ? (
        <p className="mt-3 text-sm text-rose-300" role="alert">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="mt-6 w-full rounded-lg border border-cyan-200/25 bg-cyan-200/12 px-4 py-3 text-sm font-medium text-cyan-50 transition hover:border-cyan-100/45 hover:bg-cyan-200/18 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "正在验证..." : "进入预览站"}
      </button>
    </form>
  );
}
