/**
 * 合规联系/举报/数据请求提交：纯校验逻辑（可单测），与存储层解耦。
 */

export const COMPLIANCE_INQUIRY_TOPICS = [
  "test_feedback",
  "report",
  "business",
  "data_request",
  "appeal",
] as const;

export type ComplianceInquiryTopic = (typeof COMPLIANCE_INQUIRY_TOPICS)[number];

export const MAX_COMPLIANCE_BODY_CHARS = 8000;
export const MAX_COMPLIANCE_CONTACT_CHARS = 512;

const TOPIC_SET = new Set<string>(COMPLIANCE_INQUIRY_TOPICS);

export function parseComplianceTopic(raw: unknown): ComplianceInquiryTopic | null {
  const t = typeof raw === "string" ? raw.trim() : "";
  if (!t || !TOPIC_SET.has(t)) return null;
  return t as ComplianceInquiryTopic;
}

export function normalizeComplianceContactLine(raw: unknown): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (s.length <= MAX_COMPLIANCE_CONTACT_CHARS) return s;
  return s.slice(0, MAX_COMPLIANCE_CONTACT_CHARS);
}

export function normalizeComplianceBody(raw: unknown): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (s.length <= MAX_COMPLIANCE_BODY_CHARS) return s;
  return s.slice(0, MAX_COMPLIANCE_BODY_CHARS);
}

export function validateComplianceConsent(consent: unknown): boolean {
  if (!consent || typeof consent !== "object") return false;
  const c = consent as Record<string, unknown>;
  return c.userAgreement === true && c.privacyPolicy === true;
}

/** 仅允许来自前端的非敏感构建信息，由服务端再裁剪写入 client_meta。 */
export function sanitizeClientBuildId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim().replace(/[\u0000-\u001F\u007F]/g, "");
  if (!t) return null;
  return t.length <= 64 ? t : t.slice(0, 64);
}
