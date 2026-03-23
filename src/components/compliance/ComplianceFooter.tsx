"use client";

import React from "react";
import { getPublicRuntimeConfig } from "@/lib/config/publicRuntime";

function ComplianceItem({ children }: { children: React.ReactNode }) {
  return <span className="text-xs text-slate-500/90">{children}</span>;
}

export function ComplianceFooter() {
  const cfg = getPublicRuntimeConfig();
  const c = cfg.compliance;

  const productName = c.productName ?? "文界工坊";
  const showOperating = Boolean(c.operatingSubject) || Boolean(c.contactEmail);
  const showBeian = Boolean(c.beianNumber) && Boolean(c.beianUrl);

  return (
    <footer className="w-full px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-10">
      <div className="mx-auto w-full max-w-5xl rounded-3xl border border-slate-200/70 bg-white/50 backdrop-blur-xl">
        <div className="px-6 py-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="flex flex-col gap-1">
              <div className="text-xs font-semibold tracking-widest text-slate-800/80">
                {productName} 合规区
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-2">
                {showOperating ? (
                  <>
                    {c.operatingSubject ? (
                      <ComplianceItem>运营主体：{c.operatingSubject}</ComplianceItem>
                    ) : null}
                    {c.contactEmail ? <ComplianceItem>联系邮箱：{c.contactEmail}</ComplianceItem> : null}
                    {c.customerWechat ? <ComplianceItem>客服微信：{c.customerWechat}</ComplianceItem> : null}
                    {c.customerPublicAccount ? (
                      <ComplianceItem>客服公众号：{c.customerPublicAccount}</ComplianceItem>
                    ) : null}
                  </>
                ) : (
                  <ComplianceItem>运营主体与联系方式以「联系我们」页面为准。</ComplianceItem>
                )}

                {showBeian ? (
                  <ComplianceItem>
                    备案信息：
                    <a
                      className="ml-1 text-slate-700 underline underline-offset-2 hover:text-slate-900"
                      href={c.beianUrl ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {c.beianNumber}
                    </a>
                  </ComplianceItem>
                ) : null}
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
                href="/legal/contact"
              >
                联系我们
              </a>
              <a
                className="text-xs text-slate-700 underline underline-offset-2 hover:text-slate-900"
                href="/legal/contact"
              >
                测试反馈 / 举报
              </a>
              <a
                className="text-xs text-slate-700 underline underline-offset-2 hover:text-slate-900"
                href="/legal/content-policy"
              >
                内容规范 / 社区规则
              </a>
              <a
                className="text-xs text-slate-700 underline underline-offset-2 hover:text-slate-900"
                href="/legal/ai-disclaimer"
              >
                AI 生成说明
              </a>
              <a
                className="text-xs text-slate-700 underline underline-offset-2 hover:text-slate-900"
                href="/legal/minors"
              >
                未成年人说明
              </a>
            </nav>
          </div>

          <div className="mt-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <ComplianceItem>
              {c.legalEffectiveDate ? (
                <>法律文档生效日期：{c.legalEffectiveDate}。</>
              ) : (
                <>法律文档生效日期以页面展示为准。</>
              )}
            </ComplianceItem>
            <ComplianceItem>
              {c.isTestPeriod ? <>{`当前为测试期，内容与规则可能更新。`}</> : <>{`内容与规则可能更新。`}</>}
            </ComplianceItem>
          </div>
        </div>
      </div>
    </footer>
  );
}

