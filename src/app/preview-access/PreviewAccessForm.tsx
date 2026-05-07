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
      className="relative z-10 w-full max-w-md rounded-[28px] border border-[#d8cbb8] bg-[#fbf7f0]/98 p-7 text-[#164f4d] shadow-[0_22px_62px_rgba(77,61,40,0.18),inset_0_0_0_7px_rgba(248,244,237,0.92),inset_0_0_0_8px_rgba(209,199,184,0.55)]"
    >
      <input type="hidden" name="next" value={nextPath} />
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-[#4f706a]">
          VerseCraft
        </p>
        <h1 className="vc-reading-serif mt-3 text-3xl font-semibold leading-none tracking-normal text-[#0d5a4e]">
          预览站访问验证
        </h1>
        <p className="mt-3 text-sm leading-6 text-[#4f625c]">
          这是受保护的预览环境，请输入访问密码。
        </p>
      </div>

      <label className="vc-reading-serif mt-7 block text-[1.05rem] font-semibold text-[#0d5a4e]" htmlFor="preview-password">
        访问密码
      </label>
      <input
        id="preview-password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        className="mt-2 w-full rounded-[16px] border border-[#cfc5b6] bg-[#fffdf8] px-4 py-3 text-sm text-[#0d3f39] outline-none shadow-[inset_0_0_0_4px_rgba(248,244,237,0.72)] transition placeholder:text-[#8b8074] focus:border-[#0d5a4e]"
        placeholder="请输入预览访问密码"
      />

      {state.error ? (
        <p className="mt-3 text-sm text-[#8d3f35]" role="alert">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="vc-reading-serif mt-6 w-full rounded-[16px] border border-[#0a403a] bg-[#244f45] px-4 py-3 text-[1.1rem] font-semibold text-[#fffdf8] shadow-[inset_0_0_0_4px_rgba(255,255,255,0.08),0_10px_22px_rgba(27,79,69,0.18)] transition hover:bg-[#1c453d] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "正在验证..." : "进入预览站"}
      </button>
    </form>
  );
}
