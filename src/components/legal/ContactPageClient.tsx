"use client";

import React, { useMemo, useState } from "react";
import { LegalDocShell } from "@/components/legal/LegalDocShell";
import { getPublicRuntimeConfig } from "@/lib/config/publicRuntime";

export function ContactPageClient() {
  const cfg = getPublicRuntimeConfig();
  const c = cfg.compliance;

  const contactEmail = c.contactEmail;
  const customerWechat = c.customerWechat;
  const customerPublicAccount = c.customerPublicAccount;

  const [topic, setTopic] = useState<"测试反馈" | "举报投诉" | "商务合作">("测试反馈");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [agreePrivacy, setAgreePrivacy] = useState(false);

  const mailto = useMemo(() => {
    if (!contactEmail) return null;
    const safeTopic = encodeURIComponent(topic);
    const subject = `[文界工坊 VerseCraft] ${safeTopic}`;
    const bodyLines = [
      `主题：${topic}`,
      email.trim() ? `联系方式：${email.trim()}` : `联系方式：未填写（可选）`,
      "---",
      message.trim() ? message.trim() : "（请在页面输入你的内容）",
    ];
    const body = encodeURIComponent(bodyLines.join("\n"));
    return `mailto:${encodeURIComponent(contactEmail)}?subject=${subject}&body=${body}`;
  }, [contactEmail, email, message, topic]);

  return (
    <LegalDocShell title="联系我们">
      <div className="space-y-5 text-sm text-slate-700">
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">1. 官方联系邮箱</h2>
          {contactEmail ? (
            <p className="text-slate-600">联系邮箱：{contactEmail}</p>
          ) : (
            <p className="text-slate-600">当前未配置官方邮箱。你可以使用本页面的联系表单提交内容（邮件发送功能可能受限）。</p>
          )}

          {customerWechat ? <p className="text-slate-600">客服微信：{customerWechat}</p> : null}
          {customerPublicAccount ? <p className="text-slate-600">客服公众号：{customerPublicAccount}</p> : null}
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">2. 问题反馈说明</h2>
          <p className="text-slate-600">你可以在此提交测试反馈、使用问题或合规相关说明。我们会优先处理影响核心体验与安全的问题。</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">3. 举报投诉入口说明</h2>
          <p className="text-slate-600">
            若你发现违规内容或可疑行为，请选择「举报投诉」，并尽可能提供发生时间、页面/文本片段或其他可帮助核查的信息。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">3.1 商务合作说明</h2>
          <p className="text-slate-600">
            如涉及联名活动、媒体合作、渠道推广等，请在「联系我们」中选择「商务合作」并描述合作意向与可联系信息。响应时间通常 3-5 个工作日内处理，不承诺实时回复。
          </p>
        </section>

        <section className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">4. 联系方式提交</h2>
              <p className="mt-1 text-xs text-slate-500">响应时间：通常 3-5 个工作日内处理，不承诺实时回复。</p>
            </div>
            <div className="flex gap-2">
              <a className="text-xs text-slate-600 underline underline-offset-2 hover:text-slate-900" href="/legal/privacy-policy" target="_blank" rel="noreferrer">
                查看隐私政策
              </a>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <div className="text-xs text-slate-600">选择主题</div>
              <select
                value={topic}
                onChange={(e) => setTopic(e.target.value as typeof topic)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white/80 px-3 text-sm text-slate-700 outline-none"
              >
                <option value="测试反馈">测试反馈</option>
                <option value="举报投诉">举报投诉</option>
                <option value="商务合作">商务合作</option>
              </select>
            </label>

            <label className="space-y-1">
              <div className="text-xs text-slate-600">联系方式（选填，用于后续联络）</div>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="邮箱或微信号（任选其一）"
                className="h-10 w-full rounded-xl border border-slate-200 bg-white/80 px-3 text-sm text-slate-700 outline-none"
              />
            </label>
          </div>

          <label className="space-y-1">
            <div className="text-xs text-slate-600">你的内容（必填）</div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="请尽量描述清楚：发生了什么、希望我们怎么改、如涉及违规请提供必要信息。"
              className="h-28 w-full resize-none rounded-xl border border-slate-200 bg-white/80 p-3 text-sm text-slate-700 outline-none"
            />
          </label>

          <label className="flex items-start gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={agreePrivacy}
              onChange={(e) => setAgreePrivacy(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-slate-300"
            />
            <span>我已阅读并同意《隐私政策》中关于联系与提交信息的说明，并理解提交后将用于产品优化与测试联络。</span>
          </label>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <a
              className="rounded-full border border-slate-300 bg-white/70 px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-white"
              href="/legal/privacy-policy"
              target="_blank"
              rel="noreferrer"
            >
              再看看隐私政策
            </a>
            <button
              type="button"
              disabled={!mailto || message.trim().length === 0 || !agreePrivacy}
              onClick={() => {
                if (!mailto || !message.trim() || !agreePrivacy) return;
                window.location.href = mailto;
              }}
              className="rounded-full bg-slate-800 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              发送
            </button>
          </div>
        </section>
      </div>
    </LegalDocShell>
  );
}

