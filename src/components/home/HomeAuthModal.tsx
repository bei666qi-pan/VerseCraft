"use client";

import type { FormEvent } from "react";

export type AuthMode = "login" | "register";

export type AuthNameCheckState = {
  status: "idle" | "checking" | "ok" | "taken" | "error";
  message: string;
};

export type AuthActionState = {
  success: boolean;
  message?: string;
  error?: string;
};

export type HomeAuthModalProps = {
  authMode: AuthMode;
  authFormNonce: number;
  authName: string;
  authPassword: string;
  authConsentUserAgreement: boolean;
  authConsentPrivacyPolicy: boolean;
  nameCheck: AuthNameCheckState;
  authPending: boolean;
  activeAuthState: AuthActionState;
  activeAuthAction: (formData: FormData) => void;
  activeAuthError: string;
  onClose: () => void;
  onSwitchMode: (mode: AuthMode) => void;
  onNameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onConsentUserAgreementChange: (checked: boolean) => void;
  onConsentPrivacyPolicyChange: (checked: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

/** 首页登录/注册纸质弹窗：全部状态与提交逻辑由 HomeClient 持有，本组件只负责呈现。 */
export default function HomeAuthModal({
  authMode,
  authFormNonce,
  authName,
  authPassword,
  authConsentUserAgreement,
  authConsentPrivacyPolicy,
  nameCheck,
  authPending,
  activeAuthState,
  activeAuthAction,
  activeAuthError,
  onClose,
  onSwitchMode,
  onNameChange,
  onPasswordChange,
  onConsentUserAgreementChange,
  onConsentPrivacyPolicyChange,
  onSubmit,
}: HomeAuthModalProps) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-label={authMode === "login" ? "登录" : "注册"}
    >
      <div
        className="absolute inset-0 bg-[#efe8dd]/78"
        onClick={onClose}
      />
      <div
        data-testid="home-auth-paper-modal"
        className="relative w-full max-w-md overflow-hidden rounded-[30px] border border-vc-line-warm bg-[#fbf7f0]/98 px-6 py-6 text-vc-ink vc-shadow-modal"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="vc-reading-serif text-[26px] font-semibold leading-none text-[#0d5a4e]">
              {authMode === "login" ? "登录" : "注册"}
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-[#4f625c]">
              {authMode === "login"
                ? "用笔名与密码进入已存在的档案。"
                : "创建新档案：笔名唯一，创建后可云同步与跨设备继续。"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full border border-vc-line-warm bg-vc-paper-bright px-3 py-1 text-xs font-semibold text-vc-ink shadow-sm transition hover:bg-[#f8f2e8]"
          >
            关闭
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 rounded-[18px] border border-vc-line-warm bg-vc-paper-bright/72 p-1 vc-shadow-inset-paper">
          <button
            type="button"
            onClick={() => onSwitchMode("login")}
            className={`h-10 rounded-[14px] vc-reading-serif text-[1rem] font-semibold transition ${
              authMode === "login" ? "bg-[#244f45] text-vc-paper-bright shadow-sm" : "text-[#4f625c] hover:bg-[#f8f2e8]"
            }`}
            aria-pressed={authMode === "login"}
          >
            登录
          </button>
          <button
            type="button"
            onClick={() => onSwitchMode("register")}
            className={`h-10 rounded-[14px] vc-reading-serif text-[1rem] font-semibold transition ${
              authMode === "register" ? "bg-[#244f45] text-vc-paper-bright shadow-sm" : "text-[#4f625c] hover:bg-[#f8f2e8]"
            }`}
            aria-pressed={authMode === "register"}
          >
            注册
          </button>
        </div>

        <form
          key={`auth-form-${authMode}-${authFormNonce}`}
          className="relative mt-5 space-y-3"
          action={activeAuthAction}
          onSubmit={onSubmit}
        >
          <input
            name="fax_number"
            type="text"
            autoComplete="off"
            aria-hidden={true}
            tabIndex={-1}
            className="absolute left-[-9999px] top-[-9999px] z-[-1] opacity-0"
          />
          <input
            name="name"
            autoComplete="username"
            placeholder={authMode === "login" ? "笔名" : "新笔名（唯一）"}
            className="h-11 w-full rounded-[16px] border border-[#cfc5b6] bg-vc-paper-bright px-4 text-sm text-vc-ink-deep outline-none vc-shadow-inset-paper placeholder:text-[#8b8074] focus:border-[#0d5a4e]"
            value={authName}
            onChange={(e) => onNameChange(e.target.value)}
          />
          {authMode === "register" ? (
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[#6f6a60]">笔名唯一性</span>
              <span
                className={
                  nameCheck.status === "ok"
                    ? "text-[#0d6b52]"
                    : nameCheck.status === "taken"
                      ? "text-[#9a3b35]"
                      : nameCheck.status === "error"
                        ? "text-[#8b6a22]"
                        : "text-[#6f6a60]"
                }
              >
                {nameCheck.status === "checking" ? "校验中…" : nameCheck.message || "请输入至少 2 个字符"}
              </span>
            </div>
          ) : null}
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="密码（至少 6 位）"
            className="h-11 w-full rounded-[16px] border border-[#cfc5b6] bg-vc-paper-bright px-4 text-sm text-vc-ink-deep outline-none vc-shadow-inset-paper placeholder:text-[#8b8074] focus:border-[#0d5a4e]"
            value={authPassword}
            onChange={(e) => onPasswordChange(e.target.value)}
          />
          <div className="space-y-2">
            <label className="flex items-start gap-2 text-xs text-vc-ink-deep">
              <input
                type="checkbox"
                name="consent_user_agreement"
                value="1"
                checked={authConsentUserAgreement}
                onChange={(e) => onConsentUserAgreementChange(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-[#cfc5b6] accent-[#0d5a4e]"
              />
              <span className="leading-relaxed">
                我已阅读并同意{" "}
                <a className="underline decoration-[#0d5a4e]/45 underline-offset-4 hover:text-[#0d5a4e]" href="/legal/user-agreement">
                  用户协议
                </a>
                。
              </span>
            </label>
            <label className="flex items-start gap-2 text-xs text-vc-ink-deep">
              <input
                type="checkbox"
                name="consent_privacy_policy"
                value="1"
                checked={authConsentPrivacyPolicy}
                onChange={(e) => onConsentPrivacyPolicyChange(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-[#cfc5b6] accent-[#0d5a4e]"
              />
              <span className="leading-relaxed">
                我已阅读并同意{" "}
                <a className="underline decoration-[#0d5a4e]/45 underline-offset-4 hover:text-[#0d5a4e]" href="/legal/privacy-policy">
                  隐私政策
                </a>
                。
              </span>
            </label>
          </div>
          <button
            type="submit"
            disabled={authPending}
            className={`h-12 w-full rounded-[16px] border border-[#0a403a] bg-[#244f45] vc-reading-serif text-[1.15rem] font-semibold text-vc-paper-bright shadow-[inset_0_0_0_4px_rgba(255,255,255,0.08),0_10px_22px_rgba(27,79,69,0.18)] transition hover:bg-[#1c453d] disabled:cursor-not-allowed disabled:opacity-60 ${
              authPending ? "halo-nerve" : ""
            }`}
          >
            {authPending ? "处理中..." : authMode === "login" ? "登录并进入" : "注册并进入"}
          </button>
          {!activeAuthState.success && activeAuthError && (
            <div className="mt-3 rounded-[14px] border border-[#d99a8f] bg-[#fff2ed] px-3 py-2 text-xs text-[#8d3f35]">
              {activeAuthError}
            </div>
          )}
          {activeAuthState.success && activeAuthState.message ? (
            <div className="mt-3 rounded-[14px] border border-[#9bcbb1] bg-[#edf8f1] px-3 py-2 text-xs text-[#0d6b52]">
              {authMode === "login" ? "登录成功：正在进入…" : "注册成功：正在进入…"}
            </div>
          ) : null}
        </form>
      </div>
    </div>
  );
}
