"use client";

import React from "react";
import { LEGAL_SCOPE_BOUNDARY_FOOTNOTE } from "@/lib/compliance/legalDefaults";
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
  const productName = c.productName ?? "VerseCraft（文界工坊）";
  const effective = c.legalEffectiveDate ?? null;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-16 pt-10">
      <header className="rounded-3xl border border-slate-200/70 bg-white/60 px-6 py-6 backdrop-blur-xl">
        <div className="mb-2 text-xs font-semibold tracking-widest text-slate-700/80">{productName}</div>
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{title}</h1>
        {effective ? (
          <p className="mt-2 text-xs text-slate-500">生效日期：{effective}</p>
        ) : (
          <p className="mt-2 text-xs text-slate-500">生效日期以本页首段及更新记录为准</p>
        )}
        {c.operatingSubject ? (
          <p className="mt-1 text-xs text-slate-500">运营主体：{c.operatingSubject}</p>
        ) : null}
        <div className="mt-3 space-y-1 border-t border-slate-200/80 pt-3 text-xs text-slate-600">
          <p>
            官方网站：
            <a
              className="ml-1 text-slate-800 underline underline-offset-2 hover:text-slate-950"
              href={c.officialSiteUrl}
              target="_blank"
              rel="noreferrer"
            >
              {c.officialSiteUrl}
            </a>
            <span className="text-slate-500">（域名：{c.officialDomain}）</span>
          </p>
          <p>
            ICP 备案：
            <a
              className="ml-1 text-slate-800 underline underline-offset-2 hover:text-slate-950"
              href={c.beianUrl}
              target="_blank"
              rel="noreferrer"
            >
              {c.beianNumber}
            </a>
          </p>
          <p>
            联系电话：
            <a className="ml-1 text-slate-800 underline underline-offset-2 hover:text-slate-950" href={`tel:${c.contactPhone}`}>
              {c.contactPhone}
            </a>
          </p>
        </div>
      </header>

      <section className="mt-6 rounded-3xl border border-slate-200/70 bg-white/50 px-6 py-6 backdrop-blur-xl">
        {children}
        <footer className="mt-8 border-t border-slate-200/80 pt-5 text-xs leading-relaxed text-slate-600">
          {LEGAL_SCOPE_BOUNDARY_FOOTNOTE}
        </footer>
      </section>
    </main>
  );
}
