// src/lib/config/publicRuntime.ts
/**
 * Browser-safe configuration: only `NEXT_PUBLIC_*` keys (inlined at build time).
 * Never import server secrets or `serverConfig` from client components.
 */

import {
  DEFAULT_BEIAN_NUMBER,
  DEFAULT_BEIAN_URL,
  DEFAULT_CONTACT_EMAIL,
  DEFAULT_CONTACT_PHONE,
  DEFAULT_OFFICIAL_DOMAIN,
  DEFAULT_OFFICIAL_SITE_URL,
} from "@/lib/compliance/legalDefaults";

export interface PublicRuntimeConfig {
  buildId: string | null;
  surveyUrl: string | null;
  compliance: {
    productName: string | null;
    operatingSubject: string | null;
    contactEmail: string | null;
    /** 公示电话：未配置 NEXT_PUBLIC_CONTACT_PHONE 时使用 legalDefaults 默认值 */
    contactPhone: string;
    customerWechat: string | null;
    customerPublicAccount: string | null;
    /** 公示用主域名，如 versecraft.cn */
    officialDomain: string;
    /** 含协议的官方网站入口，用于法律页引用 */
    officialSiteUrl: string;
    beianNumber: string;
    beianUrl: string;
    legalEffectiveDate: string | null;
    showMinors: boolean;
    showAiDisclaimer: boolean;
    isTestPeriod: boolean;
  };
}

export function getPublicRuntimeConfig(): PublicRuntimeConfig {
  const id = process.env.NEXT_PUBLIC_BUILD_ID?.trim();
  const surveyUrlRaw = process.env.NEXT_PUBLIC_SURVEY_URL?.trim();
  const surveyUrl = surveyUrlRaw && surveyUrlRaw.length > 0 ? surveyUrlRaw : null;

  const productNameRaw = process.env.NEXT_PUBLIC_PRODUCT_NAME?.trim();
  const productName = productNameRaw && productNameRaw.length > 0 ? productNameRaw : null;

  const operatingSubjectRaw = process.env.NEXT_PUBLIC_OPERATING_SUBJECT?.trim();
  const operatingSubject = operatingSubjectRaw && operatingSubjectRaw.length > 0 ? operatingSubjectRaw : null;

  const contactEmailRaw = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim();
  const contactEmail =
    contactEmailRaw && contactEmailRaw.length > 0 ? contactEmailRaw : DEFAULT_CONTACT_EMAIL;

  const contactPhoneRaw = process.env.NEXT_PUBLIC_CONTACT_PHONE?.trim();
  const contactPhone =
    contactPhoneRaw && contactPhoneRaw.length > 0 ? contactPhoneRaw : DEFAULT_CONTACT_PHONE;

  const customerWechatRaw = process.env.NEXT_PUBLIC_CUSTOMER_WECHAT?.trim();
  const customerWechat =
    customerWechatRaw && customerWechatRaw.length > 0 ? customerWechatRaw : null;

  const customerPublicAccountRaw = process.env.NEXT_PUBLIC_CUSTOMER_PUBLIC_ACCOUNT?.trim();
  const customerPublicAccount =
    customerPublicAccountRaw && customerPublicAccountRaw.length > 0 ? customerPublicAccountRaw : null;

  const officialDomainRaw = process.env.NEXT_PUBLIC_OFFICIAL_DOMAIN?.trim();
  const officialDomain = officialDomainRaw && officialDomainRaw.length > 0 ? officialDomainRaw : DEFAULT_OFFICIAL_DOMAIN;

  const officialSiteUrlRaw = process.env.NEXT_PUBLIC_OFFICIAL_SITE_URL?.trim();
  const officialSiteUrl =
    officialSiteUrlRaw && officialSiteUrlRaw.length > 0 ? officialSiteUrlRaw : DEFAULT_OFFICIAL_SITE_URL;

  const beianNumberRaw = process.env.NEXT_PUBLIC_BEIAN_NUMBER?.trim();
  const beianNumber = beianNumberRaw && beianNumberRaw.length > 0 ? beianNumberRaw : DEFAULT_BEIAN_NUMBER;

  const beianUrlRaw = process.env.NEXT_PUBLIC_BEIAN_URL?.trim();
  const beianUrl = beianUrlRaw && beianUrlRaw.length > 0 ? beianUrlRaw : DEFAULT_BEIAN_URL;

  const legalEffectiveDateRaw = process.env.NEXT_PUBLIC_LEGAL_EFFECTIVE_DATE?.trim();
  const legalEffectiveDate =
    legalEffectiveDateRaw && legalEffectiveDateRaw.length > 0 ? legalEffectiveDateRaw : null;

  const showMinors = (process.env.NEXT_PUBLIC_SHOW_MINORS ?? "").trim().toLowerCase() === "true";
  const showAiDisclaimerRaw = (process.env.NEXT_PUBLIC_SHOW_AI_DISCLAIMER ?? "").trim().toLowerCase();
  const showAiDisclaimer = showAiDisclaimerRaw.length === 0 ? true : showAiDisclaimerRaw === "true";
  const isTestPeriod = (process.env.NEXT_PUBLIC_IS_TEST_PERIOD ?? "").trim().toLowerCase() === "true";

  return {
    buildId: id && id.length > 0 ? id : null,
    surveyUrl,
    compliance: {
      productName,
      operatingSubject,
      contactEmail,
      contactPhone,
      customerWechat,
      customerPublicAccount,
      officialDomain,
      officialSiteUrl,
      beianNumber,
      beianUrl,
      legalEffectiveDate,
      showMinors,
      showAiDisclaimer,
      isTestPeriod,
    },
  };
}
