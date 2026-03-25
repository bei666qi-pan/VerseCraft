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
  const showOperating =
    Boolean(c.operatingSubject) ||
    Boolean(c.contactEmail) ||
    Boolean(c.contactPhone) ||
    Boolean(c.customerWechat) ||
    Boolean(c.customerPublicAccount);

  return (
    <footer className="w-full px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-10">
      <div className="mx-auto w-full max-w-5xl rounded-3xl border border-slate-200/70 bg-white/50 backdrop-blur-xl">
        <div className="px-6 py-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="flex flex-col gap-2">
              <div className="text-xs font-semibold tracking-widest text-slate-800/80">{productName} · 合规与公示</div>
              <div className="flex flex-wrap gap-x-3 gap-y-2">
                <ComplianceItem>
                  网站：
                  <a
                    className="ml-1 text-slate-700 underline underline-offset-2 hover:text-slate-900"
                    href={c.officialSiteUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {c.officialDomain}
                  </a>
                </ComplianceItem>
                <ComplianceItem>
                  备案：
                  <a
                    className="ml-1 text-slate-700 underline underline-offset-2 hover:text-slate-900"
                    href={c.beianUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {c.beianNumber}
                  </a>
                </ComplianceItem>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-2">
                {showOperating ? (
                  <>
                    {c.operatingSubject ? <ComplianceItem>运营主体：{c.operatingSubject}</ComplianceItem> : null}
                    {c.contactPhone ? <ComplianceItem>联系电话：{c.contactPhone}</ComplianceItem> : null}
                    {c.contactEmail ? <ComplianceItem>联系邮箱：{c.contactEmail}</ComplianceItem> : null}
                    {c.customerWechat ? <ComplianceItem>客服微信：{c.customerWechat}</ComplianceItem> : null}
                    {c.customerPublicAccount ? (
                      <ComplianceItem>客服公众号：{c.customerPublicAccount}</ComplianceItem>
                    ) : null}
                  </>
                ) : (
                  <ComplianceItem>运营主体与联系方式请见「联系我们」页面；亦可通过环境变量 NEXT_PUBLIC_* 配置页脚展示。</ComplianceItem>
                )}
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
              {c.legalEffectiveDate ? (
                <>法律文档生效日期（公示）：{c.legalEffectiveDate}。</>
              ) : (
                <>法律文档生效日期以各页首段记载为准。</>
              )}
            </ComplianceItem>
            <ComplianceItem>
              {c.isTestPeriod ? (
                <>当前为公测/测试期：功能、规则与文档可能调整，请以页面更新为准。</>
              ) : (
                <>功能与规则可能随版本迭代更新。</>
              )}
            </ComplianceItem>
          </div>

          <p className="mt-4 text-[11px] leading-relaxed text-slate-500/95">{LEGAL_SCOPE_BOUNDARY_FOOTNOTE}</p>
        </div>
      </div>
    </footer>
  );
}
