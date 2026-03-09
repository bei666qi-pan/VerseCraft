"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { authenticateAdminShadow, type AdminShadowAuthState } from "@/app/actions/admin";

const INITIAL_STATE: AdminShadowAuthState = { ok: false };

export function AdminShadowGate() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(authenticateAdminShadow, INITIAL_STATE);

  useEffect(() => {
    if (state.ok) {
      router.refresh();
    }
  }, [router, state.ok]);

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-black p-8 text-slate-200">
      <div className="absolute -left-20 -top-20 h-72 w-72 rounded-full bg-purple-900/20 blur-[150px]" />
      <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-purple-900/20 blur-[150px]" />
      <div className="absolute -bottom-20 -left-20 h-72 w-72 rounded-full bg-purple-900/20 blur-[150px]" />
      <div className="absolute -bottom-20 -right-20 h-72 w-72 rounded-full bg-purple-900/20 blur-[150px]" />

      <form
        action={formAction}
        className="z-10 w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 shadow-[0_0_40px_rgba(168,85,247,0.2)] backdrop-blur-2xl"
      >
        <h1 className="text-center text-lg font-semibold tracking-[0.2em] text-slate-100">
          SHADOW ACCESS
        </h1>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="Enter shadow password"
          className="mt-6 w-full rounded-xl border border-white/15 bg-black/50 px-4 py-3 text-sm text-slate-100 outline-none ring-0 placeholder:text-slate-500 focus:border-purple-400/60"
          required
        />
        {state.error ? (
          <p className="mt-3 text-xs text-rose-300">{state.error}</p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="mt-5 w-full rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-medium text-slate-100 transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Verifying..." : "Enter"}
        </button>
      </form>
    </main>
  );
}
