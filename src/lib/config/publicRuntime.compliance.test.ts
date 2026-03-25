import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_BEIAN_NUMBER,
  DEFAULT_CONTACT_PHONE,
  DEFAULT_OFFICIAL_DOMAIN,
} from "@/lib/compliance/legalDefaults";
import { getPublicRuntimeConfig } from "@/lib/config/publicRuntime";

test("publicRuntime compliance defaults include full ICP string and domain", () => {
  const c = getPublicRuntimeConfig().compliance;
  assert.ok(c.beianNumber.includes(DEFAULT_BEIAN_NUMBER) || c.beianNumber === DEFAULT_BEIAN_NUMBER);
  assert.equal(c.officialDomain, process.env.NEXT_PUBLIC_OFFICIAL_DOMAIN?.trim() || DEFAULT_OFFICIAL_DOMAIN);
  assert.ok(c.beianUrl.startsWith("https://beian.miit.gov.cn"));
  assert.equal(
    c.contactPhone,
    process.env.NEXT_PUBLIC_CONTACT_PHONE?.trim() || DEFAULT_CONTACT_PHONE,
  );
});
