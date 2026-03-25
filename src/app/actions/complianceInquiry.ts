"use server";

import { createHash } from "node:crypto";
import { and, count, eq, gte } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "../../../auth";
import { db } from "@/db";
import { complianceInquiries } from "@/db/schema";
import { recordGenericAnalyticsEvent } from "@/lib/analytics/repository";
import {
  MAX_COMPLIANCE_BODY_CHARS,
  MAX_COMPLIANCE_CONTACT_CHARS,
  normalizeComplianceBody,
  normalizeComplianceContactLine,
  parseComplianceTopic,
  sanitizeClientBuildId,
  validateComplianceConsent,
} from "@/lib/compliance/inquiryValidation";
import { env } from "@/lib/env";
import { sanitizeInputText } from "@/lib/security/helpers";
import { getClientIpFromHeaders } from "@/lib/security/helpers";
import { moderateInputOnServer } from "@/lib/safety/input/pipeline";

export type SubmitComplianceInquiryInput = {
  topic: string;
  contactLine: string;
  body: string;
  consent: { userAgreement: boolean; privacyPolicy: boolean };
  clientBuildId?: string | null;
};

export type SubmitComplianceInquiryResult =
  | { ok: true; reference: string; message: string }
  | { ok: false; message: string };

const RATE_WINDOW_MS = 60_000;
const RATE_MAX_PER_WINDOW = 8;

function hashIp(ip: string): string {
  const salt = env.authSecret.slice(0, 32);
  return createHash("sha256").update(`${ip}\n${salt}`).digest("hex");
}

export async function submitComplianceInquiry(input: SubmitComplianceInquiryInput): Promise<SubmitComplianceInquiryResult> {
  if (!validateComplianceConsent(input.consent)) {
    return { ok: false, message: "请先勾选同意《用户协议》与《隐私政策》后再提交。" };
  }

  const topic = parseComplianceTopic(input.topic);
  if (!topic) {
    return { ok: false, message: "请求类型无效，请重新选择主题。" };
  }

  const contactLine = sanitizeInputText(normalizeComplianceContactLine(input.contactLine), MAX_COMPLIANCE_CONTACT_CHARS);
  const body = sanitizeInputText(normalizeComplianceBody(input.body), MAX_COMPLIANCE_BODY_CHARS);
  if (!body) {
    return { ok: false, message: "正文不能为空。" };
  }

  const h = await headers();
  const ip = getClientIpFromHeaders(h);
  const ipHash = hashIp(ip);
  const since = new Date(Date.now() - RATE_WINDOW_MS);

  try {
    const [{ n }] = await db
      .select({ n: count() })
      .from(complianceInquiries)
      .where(and(eq(complianceInquiries.ipHash, ipHash), gte(complianceInquiries.createdAt, since)));

    if (Number(n) >= RATE_MAX_PER_WINDOW) {
      return { ok: false, message: "提交过于频繁，请约一分钟后再试。" };
    }
  } catch {
    /* 表未就绪时仍尝试插入，由 insert 报错分支处理 */
  }

  const session = await auth();
  const userId = session?.user?.id ?? null;

  // Input safety: moderate body for report/complaint channel. Do not moderate contactLine here,
  // because users may legitimately provide联系方式 in the dedicated field.
  const safety = await moderateInputOnServer({
    scene: "report_input",
    text: body,
    userId: userId ?? undefined,
    sessionId: ipHash,
    ip: ip,
  });
  if (safety.decision !== "allow") {
    return { ok: false, message: safety.userMessage };
  }

  const clientMeta: Record<string, unknown> = {
    page: "/legal/contact",
    topic,
  };
  const bid = sanitizeClientBuildId(input.clientBuildId);
  if (bid) clientMeta.buildId = bid;
  const ua = h.get("user-agent");
  if (ua && ua.length > 0) {
    clientMeta.userAgentSnippet = ua.length > 180 ? `${ua.slice(0, 180)}…` : ua;
  }

  try {
    const [row] = await db
      .insert(complianceInquiries)
      .values({
        topic,
        contactLine: contactLine || null,
        body,
        userId,
        ipHash,
        clientMeta,
      })
      .returning({ id: complianceInquiries.id });

    const id = row?.id;
    if (id == null) {
      return { ok: false, message: "受理失败，请稍后再试。" };
    }

    const reference = `VC-COMP-${id}`;

    void recordGenericAnalyticsEvent({
      eventId: `${userId ?? "guest"}:compliance_inquiry:${id}:${Date.now()}`,
      idempotencyKey: `compliance_inquiry:${id}`,
      userId,
      sessionId: "system",
      eventName: "compliance_inquiry_submitted",
      eventTime: new Date(),
      page: "/legal/contact",
      source: "compliance_inquiry",
      platform: "unknown",
      tokenCost: 0,
      playDurationDeltaSec: 0,
      payload: { topic, reference, bodyLen: body.length, loggedIn: Boolean(userId) },
    }).catch(() => {});

    return {
      ok: true,
      reference,
      message:
        "我们已收到您的提交并生成受理参考号。工作人员将在合理期限内处理；复杂事项可能需人工核验与多轮沟通。当前阶段无自助工单后台，处理进度请通过同一邮箱或联系方式跟进。",
    };
  } catch (e) {
    console.error("[complianceInquiry] insert failed", e);
    return { ok: false, message: "受理失败，请稍后再试或改用邮件联系。" };
  }
}
