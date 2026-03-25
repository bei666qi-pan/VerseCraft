"use client";

import React, { useMemo, useState, useTransition } from "react";
import { submitComplianceInquiry } from "@/app/actions/complianceInquiry";
import { LegalDocShell } from "@/components/legal/LegalDocShell";
import type { ComplianceInquiryTopic } from "@/lib/compliance/inquiryValidation";
import { getPublicRuntimeConfig } from "@/lib/config/publicRuntime";

const TOPIC_OPTIONS: { value: ComplianceInquiryTopic; label: string }[] = [
  { value: "test_feedback", label: "测试反馈" },
  { value: "report", label: "举报投诉" },
  { value: "business", label: "商务合作" },
  { value: "data_request", label: "数据权利请求（删除/更正/导出等）" },
  { value: "appeal", label: "申诉与复核" },
];

export function ContactPageClient() {
  const cfg = getPublicRuntimeConfig();
  const c = cfg.compliance;

  const productName = c.productName ?? "VerseCraft（文界工坊）";
  const contactEmail = c.contactEmail;
  const contactPhone = c.contactPhone;
  const customerWechat = c.customerWechat;
  const customerPublicAccount = c.customerPublicAccount;

  const [topic, setTopic] = useState<ComplianceInquiryTopic>("test_feedback");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [agreeUserAgreement, setAgreeUserAgreement] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; reference?: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const mailto = useMemo(() => {
    if (!contactEmail) return null;
    const label = TOPIC_OPTIONS.find((x) => x.value === topic)?.label ?? topic;
    const subject = encodeURIComponent(`[${productName}] ${label}`);
    const bodyLines = [
      `主题类型：${label}`,
      email.trim() ? `回邮/回联方式：${email.trim()}` : `回邮/回联方式：未填写`,
      `站点：${c.officialSiteUrl}`,
      result?.reference ? `受理参考号（如有）：${result.reference}` : "",
      "---",
      message.trim() ? message.trim() : "（正文）",
    ].filter(Boolean);
    const body = encodeURIComponent(bodyLines.join("\n"));
    return `mailto:${encodeURIComponent(contactEmail)}?subject=${subject}&body=${body}`;
  }, [contactEmail, email, message, topic, productName, c.officialSiteUrl, result?.reference]);

  const canSubmit =
    message.trim().length > 0 && agreeUserAgreement && agreePrivacy && !isPending;

  function handleServerSubmit() {
    setResult(null);
    startTransition(() => {
      void (async () => {
        const r = await submitComplianceInquiry({
          topic,
          contactLine: email,
          body: message,
          consent: { userAgreement: agreeUserAgreement, privacyPolicy: agreePrivacy },
          clientBuildId: cfg.buildId,
        });
        if (r.ok) {
          setResult({ ok: true, message: r.message, reference: r.reference });
        } else {
          setResult({ ok: false, message: r.message });
        }
      })();
    });
  }

  return (
    <LegalDocShell title="联系我们 · 投诉举报与权利请求">
      <div className="space-y-6 text-sm leading-relaxed text-slate-700">
        <section className="space-y-2 rounded-2xl border border-emerald-200/80 bg-emerald-50/40 p-4 text-slate-700">
          <h2 className="text-base font-semibold text-slate-900">首选：在线提交（服务端受理与留痕）</h2>
          <p>
            您在本页下方表单提交的内容将<strong className="font-medium text-slate-800">写入服务端数据库</strong>
            （表 <code className="rounded bg-white/80 px-1 text-xs">compliance_inquiries</code>），用于受理、核查与合规留痕，并生成
            <strong className="font-medium text-slate-800"> 受理参考号</strong>（格式 <code className="text-xs">VC-COMP-编号</code>）。
            该路径<strong>不是</strong>纯邮件跳转，便于我们在无完整工单后台阶段仍可追溯。
          </p>
          <p className="text-xs text-slate-600">
            我们<strong>不</strong>在成功页回显您的账号密码或完整存档 JSON；请勿在正文中主动粘贴敏感凭证。处理进度依赖您填写的回联方式或注册账号关联信息。
          </p>
        </section>

        <section className="space-y-2 rounded-2xl border border-amber-200/80 bg-amber-50/50 p-4 text-slate-700">
          <h2 className="text-base font-semibold text-slate-900">补充：邮件副本（可选）</h2>
          <p>
            若已配置官方邮箱，您可在在线提交成功后，使用「生成邮件副本」将相同内容发到邮箱作为您的本地留痕。
            <strong className="font-medium text-slate-800"> 邮件本身不会自动触发我们的工单系统</strong>
            ，以服务端受理记录为准。
          </p>
          <p className="text-xs text-slate-600">
            相关义务、答复时限与争议解决，以《用户协议》《隐私政策》及适用法律为准。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">官方联系方式</h2>
          <p>
            <strong>联系电话：</strong>
            <a className="text-slate-800 underline underline-offset-2" href={`tel:${contactPhone}`}>
              {contactPhone}
            </a>
            <span className="text-xs text-slate-500">（紧急或需语音沟通时可拨打；受理与留痕仍以在线提交为准）</span>
          </p>
          {contactEmail ? (
            <p>
              <strong>联系邮箱：</strong>
              {contactEmail}
            </p>
          ) : (
            <p className="text-slate-600">
              未配置 <code className="rounded bg-slate-100 px-1 text-xs">NEXT_PUBLIC_CONTACT_EMAIL</code> 时，您仍可通过在线提交留痕；邮件副本不可用。
            </p>
          )}
          {customerWechat ? (
            <p>
              <strong>客服微信：</strong>
              {customerWechat}
            </p>
          ) : null}
          {customerPublicAccount ? (
            <p>
              <strong>客服公众号：</strong>
              {customerPublicAccount}
            </p>
          ) : null}
          <p className="text-xs text-slate-500">
            网站与备案：{c.officialSiteUrl} ·{" "}
            <a className="underline underline-offset-2" href={c.beianUrl} target="_blank" rel="noreferrer">
              {c.beianNumber}
            </a>
          </p>
          <p>
            <a className="text-slate-800 underline underline-offset-2" href="/legal/data-handling">
              数据处理位置与删除/导出范围说明
            </a>
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">主题说明</h2>
          <ul className="list-disc space-y-1 pl-5 text-slate-600">
            <li>
              <strong>测试反馈：</strong>缺陷、体验、平衡与文档问题。
            </li>
            <li>
              <strong>举报投诉：</strong>违法违规、侵权、诈骗、漏洞线索等。
            </li>
            <li>
              <strong>商务合作：</strong>媒体与渠道等合作意向。
            </li>
            <li>
              <strong>数据权利请求：</strong>删除、更正、导出、撤回同意等（需可核验身份）。
            </li>
            <li>
              <strong>申诉与复核：</strong>对处置、限权、风控有异议。
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">受理优先级（目标性指引）</h2>
          <ul className="list-disc space-y-1 pl-5 text-slate-600">
            <li>安全与违法违规举报优先初筛；</li>
            <li>数据权利请求在身份验证后按法律时限目标答复；</li>
            <li>一般反馈与商务咨询按人力排期。</li>
          </ul>
        </section>

        <section className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">在线提交</h2>
              <p className="mt-1 text-xs text-slate-500">提交成功后请保存受理参考号以便跟进。</p>
            </div>
            <a
              className="text-xs text-slate-600 underline underline-offset-2 hover:text-slate-900"
              href="/legal/privacy-policy"
              target="_blank"
              rel="noreferrer"
            >
              隐私政策
            </a>
          </div>

          {result ? (
            <div
              className={`rounded-xl border px-3 py-2 text-sm ${
                result.ok ? "border-emerald-200 bg-emerald-50/80 text-emerald-950" : "border-red-200 bg-red-50/80 text-red-950"
              }`}
            >
              {result.ok && result.reference ? (
                <p>
                  <strong>受理参考号：</strong>
                  <span className="font-mono">{result.reference}</span>
                </p>
              ) : null}
              <p className={result.ok && result.reference ? "mt-1" : ""}>{result.message}</p>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <div className="text-xs text-slate-600">选择主题</div>
              <select
                value={topic}
                onChange={(e) => setTopic(e.target.value as ComplianceInquiryTopic)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white/80 px-3 text-sm text-slate-700 outline-none"
              >
                {TOPIC_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <div className="text-xs text-slate-600">回邮/回联方式（强烈建议填写）</div>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="邮箱或微信号"
                className="h-10 w-full rounded-xl border border-slate-200 bg-white/80 px-3 text-sm text-slate-700 outline-none"
              />
            </label>
          </div>

          <label className="space-y-1">
            <div className="text-xs text-slate-600">详细说明（必填）</div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="请描述事由、时间线、账号名（非密码）、期望处理方式等。"
              className="h-36 w-full resize-none rounded-xl border border-slate-200 bg-white/80 p-3 text-sm text-slate-700 outline-none"
            />
          </label>

          <label className="flex items-start gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={agreeUserAgreement}
              onChange={(e) => setAgreeUserAgreement(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-slate-300"
            />
            <span>
              我已阅读并同意{" "}
              <a className="underline underline-offset-2" href="/legal/user-agreement" target="_blank" rel="noreferrer">
                《用户协议》
              </a>
              。
            </span>
          </label>

          <label className="flex items-start gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={agreePrivacy}
              onChange={(e) => setAgreePrivacy(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-slate-300"
            />
            <span>
              我已阅读并同意{" "}
              <a className="underline underline-offset-2" href="/legal/privacy-policy" target="_blank" rel="noreferrer">
                《隐私政策》
              </a>
              ，知悉提交内容用于受理、核查、回复及必要安全留痕。
            </span>
          </label>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => handleServerSubmit()}
              className="rounded-full bg-slate-800 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? "提交中…" : "提交至服务端"}
            </button>
            <button
              type="button"
              disabled={!mailto || message.trim().length === 0 || !agreeUserAgreement || !agreePrivacy}
              onClick={() => {
                if (!mailto) return;
                window.location.href = mailto;
              }}
              className="rounded-full border border-slate-400 bg-white/80 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              生成邮件副本
            </button>
          </div>
        </section>
      </div>
    </LegalDocShell>
  );
}
