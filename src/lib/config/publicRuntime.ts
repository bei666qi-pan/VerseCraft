// src/lib/config/publicRuntime.ts
/**
 * Browser-safe configuration: only `NEXT_PUBLIC_*` keys (inlined at build time).
 * Never import server secrets or `serverConfig` from client components.
 */

export interface PublicRuntimeConfig {
  buildId: string | null;
  surveyUrl: string | null;
  compliance: {
    productName: string | null;
    operatingSubject: string | null;
    contactEmail: string | null;
    customerWechat: string | null;
    customerPublicAccount: string | null;
    beianNumber: string | null;
    beianUrl: string | null;
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
  const contactEmail = contactEmailRaw && contactEmailRaw.length > 0 ? contactEmailRaw : null;

  const customerWechatRaw = process.env.NEXT_PUBLIC_CUSTOMER_WECHAT?.trim();
  const customerWechat =
    customerWechatRaw && customerWechatRaw.length > 0 ? customerWechatRaw : null;

  const customerPublicAccountRaw = process.env.NEXT_PUBLIC_CUSTOMER_PUBLIC_ACCOUNT?.trim();
  const customerPublicAccount =
    customerPublicAccountRaw && customerPublicAccountRaw.length > 0 ? customerPublicAccountRaw : null;

  const beianNumberRaw = process.env.NEXT_PUBLIC_BEIAN_NUMBER?.trim();
  const beianNumber = beianNumberRaw && beianNumberRaw.length > 0 ? beianNumberRaw : null;

  const beianUrlRaw = process.env.NEXT_PUBLIC_BEIAN_URL?.trim();
  const beianUrl = beianUrlRaw && beianUrlRaw.length > 0 ? beianUrlRaw : null;

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
      customerWechat,
      customerPublicAccount,
      beianNumber,
      beianUrl,
      legalEffectiveDate,
      showMinors,
      showAiDisclaimer,
      isTestPeriod,
    },
  };
}
