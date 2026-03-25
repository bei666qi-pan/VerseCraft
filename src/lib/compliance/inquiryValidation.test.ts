import test from "node:test";
import assert from "node:assert/strict";
import {
  COMPLIANCE_INQUIRY_TOPICS,
  MAX_COMPLIANCE_BODY_CHARS,
  MAX_COMPLIANCE_CONTACT_CHARS,
  normalizeComplianceBody,
  normalizeComplianceContactLine,
  parseComplianceTopic,
  sanitizeClientBuildId,
  validateComplianceConsent,
} from "./inquiryValidation";

test("parseComplianceTopic accepts known slugs only", () => {
  assert.equal(parseComplianceTopic("report"), "report");
  assert.equal(parseComplianceTopic(" data_request "), "data_request");
  assert.equal(parseComplianceTopic("invalid"), null);
  assert.equal(parseComplianceTopic(null), null);
});

test("COMPLIANCE_INQUIRY_TOPICS covers five categories", () => {
  assert.equal(COMPLIANCE_INQUIRY_TOPICS.length, 5);
});

test("normalizeComplianceBody trims and caps length", () => {
  const long = "x".repeat(MAX_COMPLIANCE_BODY_CHARS + 50);
  assert.equal(normalizeComplianceBody(`  ${long}  `).length, MAX_COMPLIANCE_BODY_CHARS);
});

test("normalizeComplianceContactLine caps length", () => {
  const long = "y".repeat(MAX_COMPLIANCE_CONTACT_CHARS + 10);
  assert.equal(normalizeComplianceContactLine(long).length, MAX_COMPLIANCE_CONTACT_CHARS);
});

test("validateComplianceConsent requires both flags", () => {
  assert.equal(validateComplianceConsent({ userAgreement: true, privacyPolicy: true }), true);
  assert.equal(validateComplianceConsent({ userAgreement: true, privacyPolicy: false }), false);
  assert.equal(validateComplianceConsent(null), false);
});

test("sanitizeClientBuildId strips control chars and caps", () => {
  assert.equal(sanitizeClientBuildId("build-123"), "build-123");
  assert.equal(sanitizeClientBuildId("a".repeat(100))?.length, 64);
  assert.equal(sanitizeClientBuildId("\x00x"), "x");
});
