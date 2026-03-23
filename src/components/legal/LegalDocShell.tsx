"use client";

import React from "react";
import { getPublicRuntimeConfig } from "@/lib/config/publicRuntime";

export function LegalDocShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const cfg = getPublicRuntimeConfig();
  const c = cfg.compliance;
  const productName = c.productName ?? "文界工坊";
  const effective = c.legalEffectiveDate ?? null;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-16 pt-10">
      <header className="rounded-3xl border border-slate-200/70 bg-white/60 px-6 py-6 backdrop-blur-xl">
        <div className="mb-2 text-xs font-semibold tracking-widest text-slate-700/80">{productName}</div>
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{title}</h1>
        {effective ? (
          <p className="mt-2 text-xs text-slate-500">生效日期：{effective}</p>
        ) : (
          <p className="mt-2 text-xs text-slate-500">生效日期以页面展示为准</p>
        )}
        {c.operatingSubject ? (
          <p className="mt-2 text-xs text-slate-500">运营主体：{c.operatingSubject}</p>
        ) : null}
      </header>

      <section className="mt-6 rounded-3xl border border-slate-200/70 bg-white/50 px-6 py-6 backdrop-blur-xl">
        {children}
      </section>
    </main>
  );
}

