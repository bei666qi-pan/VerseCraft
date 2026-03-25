"use client";

import React from "react";
import { DEFAULT_BEIAN_NUMBER } from "@/lib/compliance/legalDefaults";
import { getPublicRuntimeConfig } from "@/lib/config/publicRuntime";

/**
 * 主页最底部居中公示：完整 ICP 备案号 + 指向工信部备案管理系统（beian.miit.gov.cn）。
 * 满足「备案号完整可见」与「可点击跳转至指定系统」的常见公示要求。
 */
export function HomeIcpBeianBar() {
  const c = getPublicRuntimeConfig().compliance;
  const beianNumber = c.beianNumber?.trim() || DEFAULT_BEIAN_NUMBER;
  const beianUrl = c.beianUrl?.trim() || "https://beian.miit.gov.cn";

  return (
    <div
      className="w-full px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3"
      role="contentinfo"
      aria-label="ICP 备案信息"
    >
      <p className="mx-auto max-w-5xl text-center text-xs leading-relaxed text-slate-500">
        <a
          href={beianUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-block text-slate-600 underline underline-offset-4 decoration-slate-400/80 transition hover:text-slate-900 hover:decoration-slate-600"
        >
          {beianNumber}
        </a>
      </p>
    </div>
  );
}
