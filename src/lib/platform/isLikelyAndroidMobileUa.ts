// src/lib/platform/isLikelyAndroidMobileUa.ts
/** Lightweight UA hint for Android client-side navigation / timeout tuning. */
export function isLikelyAndroidMobileUa(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent || "");
}
