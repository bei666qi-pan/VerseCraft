"use client";

import React from "react";
import { LEGAL_SCOPE_BOUNDARY_FOOTNOTE } from "@/lib/compliance/legalDefaults";
import { getPublicRuntimeConfig } from "@/lib/config/publicRuntime";

function ComplianceItem({ children }: { children: React.ReactNode }) {
  return <span className="text-xs text-slate-500/90">{children}</span>;
}

export function ComplianceFooter() {
  const cfg = getPublicRuntimeConfig();
  const c = cfg.compliance;

  const productName = c.productName ?? "VerseCraft（文界工坊）";
  const compactProductName = productName.replace(/（.*?）/g, "").trim();

  return (
    <footer className="w-full px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-10">
      <div className="mx-auto w-full max-w-5xl">
        <div className="rounded-3xl bg-white/35 px-6 py-6 backdrop-blur-xl">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex flex-col gap-2">
              <div className="text-xs font-semibold tracking-widest text-slate-700/80">{compactProductName} · 合规</div>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                <ComplianceItem>
                  <a
                    className="text-slate-700 underline underline-offset-2 hover:text-slate-900"
                    href={c.officialSiteUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {c.officialDomain}
                  </a>
                </ComplianceItem>
                <ComplianceItem>
                  <a
                    className="text-slate-700 underline underline-offset-2 hover:text-slate-900"
                    href={c.beianUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {c.beianNumber}
                  </a>
                </ComplianceItem>
                <ComplianceItem>联系邮箱：{c.contactEmail}</ComplianceItem>
              </div>
            </div>

            <nav aria-label="法律与合规链接" className="flex flex-wrap gap-x-4 gap-y-2">
              <a
                className="text-xs text-slate-700 underline underline-offset-2 hover:text-slate-900"
                href="/legal/user-agreement"
              >
                用户协议
              </a>
              <a
                className="text-xs text-slate-700 underline underline-offset-2 hover:text-slate-900"
                href="/legal/privacy-policy"
              >
                隐私政策
              </a>
              <a
                className="text-xs text-slate-700 underline underline-offset-2 hover:text-slate-900"
                href="/legal/content-policy"
              >
                内容规范
              </a>
              {c.showAiDisclaimer ? (
                <a
                  className="text-xs text-slate-700 underline underline-offset-2 hover:text-slate-900"
                  href="/legal/ai-disclaimer"
                >
                  AI 说明
                </a>
              ) : null}
              {c.showMinors ? (
                <a
                  className="text-xs text-slate-700 underline underline-offset-2 hover:text-slate-900"
                  href="/legal/minors"
                >
                  未成年人
                </a>
              ) : null}
              <a
                className="text-xs text-slate-700 underline underline-offset-2 hover:text-slate-900"
                href="/legal/data-handling"
              >
                数据范围
              </a>
              <a
                className="text-xs text-slate-700 underline underline-offset-2 hover:text-slate-900"
                href="/legal/contact"
              >
                联系 / 投诉举报
              </a>
              <a
                className="text-xs text-slate-700 underline underline-offset-2 hover:text-slate-900"
                href="/legal/index"
              >
                法律中心
              </a>
            </nav>
          </div>

          <div className="mt-4 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <ComplianceItem>
              {c.legalEffectiveDate ? <>生效日期：{c.legalEffectiveDate}。</> : <>生效日期以各页首段为准。</>}
            </ComplianceItem>
            <ComplianceItem>{c.isTestPeriod ? <>测试期：规则与文档可能调整。</> : <>规则可能随版本迭代更新。</>}</ComplianceItem>
          </div>

          <p className="mt-4 text-[11px] leading-relaxed text-slate-500/90">{LEGAL_SCOPE_BOUNDARY_FOOTNOTE}</p>
        </div>
      </div>
    </footer>
  );
}
