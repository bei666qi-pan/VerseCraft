"use client";

import { SURVEY_COPY } from "@/components/home/homeSurveyCopy";

// 兼容旧导入路径：文案本体已移至 homeSurveyCopy.ts（避免值导入阻断 chunk 拆分）。
export { SURVEY_COPY };

export type HomeSurveyQuestionId =
  | "discoverySource"
  | "experienceStage"
  | "createFriction"
  | "immersionIssue"
  | "coreFunPoint"
  | "quitReason"
  | "topFixOne"
  | "saveLossConcern"
  | "recommendWillingness"
  | "finalSuggestion";

export type HomeSurveyQuestionConfig =
  | {
      id: Exclude<HomeSurveyQuestionId, "topFixOne" | "finalSuggestion">;
      kind: "single";
      title: string;
      subtitle?: string;
      required: true;
      options: Array<{ value: string; label: string }>;
    }
  | {
      id: "topFixOne" | "finalSuggestion";
      kind: "text";
      title: string;
      subtitle?: string;
      required: boolean;
      maxLen: 500;
      placeholder: string;
    };

export type SurveyCompletionState = "loading" | "open" | "done";

export type HomeSurveyModalProps = {
  open: boolean;
  onClose: () => void;
  showBugFeedback: boolean;
  onShowBugFeedback: (show: boolean) => void;
  surveyCompletion: SurveyCompletionState;
  question: HomeSurveyQuestionConfig;
  safeStep: number;
  totalSteps: number;
  progressPct: number;
  getSurveyValue: (id: HomeSurveyQuestionId) => string;
  setSurveyValue: (id: HomeSurveyQuestionId, value: string) => void;
  surveyConsentUserAgreement: boolean;
  surveyConsentPrivacyPolicy: boolean;
  onSurveyConsentUserAgreementChange: (checked: boolean) => void;
  onSurveyConsentPrivacyPolicyChange: (checked: boolean) => void;
  onStepPrev: () => void;
  onStepNext: () => void;
  surveyNextHint: boolean;
  surveyUrl: string | null;
  onOpenExternalSurvey: () => void;
  surveySubmitPending: boolean;
  onSubmitSurvey: () => void;
  feedbackSuccess: boolean;
  feedbackContent: string;
  onFeedbackContentChange: (value: string) => void;
  feedbackConsentUserAgreement: boolean;
  feedbackConsentPrivacyPolicy: boolean;
  onFeedbackConsentUserAgreementChange: (checked: boolean) => void;
  onFeedbackConsentPrivacyPolicyChange: (checked: boolean) => void;
  feedbackPending: boolean;
  onSubmitFeedback: () => void;
};

/** 首页产品问卷/开放反馈纸质弹窗：全部状态、埋点与提交逻辑由 HomeClient 持有，本组件只负责呈现。 */
export default function HomeSurveyModal({
  open,
  onClose,
  showBugFeedback,
  onShowBugFeedback,
  surveyCompletion,
  question: curQ,
  safeStep,
  totalSteps,
  progressPct,
  getSurveyValue,
  setSurveyValue,
  surveyConsentUserAgreement,
  surveyConsentPrivacyPolicy,
  onSurveyConsentUserAgreementChange,
  onSurveyConsentPrivacyPolicyChange,
  onStepPrev,
  onStepNext,
  surveyNextHint,
  surveyUrl,
  onOpenExternalSurvey,
  surveySubmitPending,
  onSubmitSurvey,
  feedbackSuccess,
  feedbackContent,
  onFeedbackContentChange,
  feedbackConsentUserAgreement,
  feedbackConsentPrivacyPolicy,
  onFeedbackConsentUserAgreementChange,
  onFeedbackConsentPrivacyPolicyChange,
  feedbackPending,
  onSubmitFeedback,
}: HomeSurveyModalProps) {
  return (
    <div
      className={`fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto px-3 py-4 transition-all duration-500 sm:p-6 ${
        open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      <div
        className={`fixed inset-0 bg-[#efe8dd]/82 transition-all duration-500 ${
          open ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />
      <div
        data-testid="home-survey-paper-modal"
        className={`relative w-full max-w-[430px] overflow-hidden rounded-[30px] border border-vc-line-warm bg-[#fbf7f0]/96 px-[clamp(1.35rem,6vw,2.4rem)] py-[clamp(1.7rem,7vw,2.8rem)] text-[#0f4f47] shadow-[0_22px_62px_rgba(77,61,40,0.18),inset_0_0_0_7px_rgba(248,244,237,0.92),inset_0_0_0_8px_rgba(209,199,184,0.55),inset_0_0_0_17px_rgba(255,253,248,0.78),inset_0_0_0_18px_rgba(224,214,199,0.5)] transition-all duration-500 sm:max-w-[470px] ${
          open ? "scale-100 opacity-100" : "scale-95 opacity-0"
        }`}
      >
        <h3 className="vc-reading-serif text-[clamp(2.45rem,12vw,3.6rem)] font-semibold leading-none text-[#0d5a4e]">{SURVEY_COPY.title}</h3>
        {!showBugFeedback ? (
          <>
            <p className="mt-5 text-[13px] leading-relaxed text-[#4f625c]">{SURVEY_COPY.subtitle}</p>

            {surveyCompletion === "loading" ? (
              <p className="vc-reading-serif mt-10 text-center text-[1.2rem] text-[#0d5a4e]">{SURVEY_COPY.syncHint}</p>
            ) : surveyCompletion === "done" ? (
              <div className="mt-9 rounded-[22px] border border-vc-line-warm bg-vc-paper-bright/78 p-6 text-center shadow-[inset_0_0_0_5px_rgba(248,244,237,0.72),inset_0_0_0_6px_rgba(221,211,196,0.46)]">
                <p className="vc-reading-serif text-[1.25rem] font-medium text-[#0d5a4e]">{SURVEY_COPY.surveyDoneLine}</p>
                <button
                  type="button"
                  onClick={() => onShowBugFeedback(true)}
                  className="vc-reading-serif mt-5 rounded-[18px] border border-[#0d5a4e] bg-vc-paper-bright px-5 py-2.5 text-[1rem] font-semibold text-[#0d5a4e] shadow-sm transition hover:bg-[#f8f2e8]"
                >
                  {SURVEY_COPY.feedbackSecondary}
                </button>
              </div>
            ) : (
              <>
                <div className="mt-9 rounded-[22px] border border-vc-line-warm bg-vc-paper-bright/72 p-5 shadow-[inset_0_0_0_5px_rgba(248,244,237,0.72),inset_0_0_0_6px_rgba(221,211,196,0.46)]">
                  <div className="flex items-center justify-between gap-3">
                    <div className="vc-reading-serif whitespace-nowrap text-[1.05rem] leading-tight text-[#0d5a4e]">
                      <span className="block">进度</span>
                      <span>{safeStep + 1}/{totalSteps}</span>
                    </div>
                    <div className="h-3 w-[58%] overflow-hidden rounded-full border border-[#d4c9ba] bg-[#eee7df] shadow-[inset_0_1px_2px_rgba(69,53,35,0.12)]">
                      <div className="h-full rounded-full bg-[#0d5a4e] transition-[width] duration-300" style={{ width: `${progressPct}%` }} />
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="vc-reading-serif text-[clamp(1.35rem,6vw,1.8rem)] font-semibold leading-snug text-[#0d5a4e]">{curQ.title}</div>
                    {curQ.subtitle ? (
                      <div className="mt-2 text-[12px] leading-relaxed text-[#596a64]">{curQ.subtitle}</div>
                    ) : null}

                    {curQ.kind === "single" ? (
                      <select
                        value={getSurveyValue(curQ.id)}
                        onChange={(e) => setSurveyValue(curQ.id, e.target.value)}
                        className="vc-reading-serif mt-5 h-14 w-full rounded-[18px] border border-[#cfc5b6] bg-vc-paper-bright px-5 text-[1.15rem] text-vc-ink-deep outline-none vc-shadow-inset-paper focus:border-[#0d5a4e]"
                      >
                        <option value="">请选择</option>
                        {curQ.options.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="mt-3 space-y-3">
                        <textarea
                          value={getSurveyValue(curQ.id)}
                          onChange={(e) => setSurveyValue(curQ.id, e.target.value.slice(0, curQ.maxLen))}
                          placeholder={curQ.placeholder}
                          className="mt-2 h-32 w-full resize-none rounded-[18px] border border-[#cfc5b6] bg-vc-paper-bright p-4 text-[15px] leading-relaxed text-vc-ink-deep outline-none vc-shadow-inset-paper placeholder:text-[#8b8074] focus:border-[#0d5a4e]"
                        />
                        <div className="text-right text-[11px] text-[#6f6a60]">
                          {getSurveyValue(curQ.id).length}/{curQ.maxLen}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-6 rounded-[20px] border border-vc-line-warm bg-vc-paper-bright/72 p-4 shadow-[inset_0_0_0_5px_rgba(248,244,237,0.68)]">
                  <label className="vc-reading-serif flex items-start gap-3 text-[1rem] leading-relaxed text-vc-ink-deep">
                    <input
                      type="checkbox"
                      checked={surveyConsentUserAgreement}
                      onChange={(e) => onSurveyConsentUserAgreementChange(e.target.checked)}
                      className="mt-1 h-5 w-5 shrink-0 rounded-[6px] border-[#cfc5b6] accent-[#0d5a4e]"
                    />
                    <span>
                      我已阅读并同意{" "}
                      <a className="underline decoration-[#0d5a4e]/45 underline-offset-4 hover:text-[#0d5a4e]" href="/legal/user-agreement">
                        用户协议
                      </a>
                      。
                    </span>
                  </label>
                  <label className="vc-reading-serif mt-4 flex items-start gap-3 text-[1rem] leading-relaxed text-vc-ink-deep">
                    <input
                      type="checkbox"
                      checked={surveyConsentPrivacyPolicy}
                      onChange={(e) => onSurveyConsentPrivacyPolicyChange(e.target.checked)}
                      className="mt-1 h-5 w-5 shrink-0 rounded-[6px] border-[#cfc5b6] accent-[#0d5a4e]"
                    />
                    <span>
                      我已阅读并同意{" "}
                      <a className="underline decoration-[#0d5a4e]/45 underline-offset-4 hover:text-[#0d5a4e]" href="/legal/privacy-policy">
                        隐私政策
                      </a>
                      。
                    </span>
                  </label>
                </div>

                <div className="mt-6 flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={onStepPrev}
                      disabled={safeStep === 0}
                      className="vc-reading-serif min-h-12 rounded-[18px] border border-vc-line-warm bg-vc-paper-bright px-5 text-[1.1rem] font-semibold text-[#0d5a4e] vc-shadow-inset-paper transition-all hover:bg-[#f8f2e8] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      上一题
                    </button>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={onStepNext}
                        disabled={safeStep >= totalSteps - 1}
                        className="vc-reading-serif min-h-12 w-full rounded-[18px] border border-vc-line-warm bg-vc-paper-bright px-5 text-[1.1rem] font-semibold text-[#0d5a4e] vc-shadow-inset-paper transition-all hover:bg-[#f8f2e8] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        下一题
                      </button>
                      {surveyNextHint ? (
                        <div className="pointer-events-none absolute right-0 top-full mt-2 whitespace-nowrap rounded-full border border-vc-line-warm bg-[#fff8e9] px-3 py-1.5 text-xs font-semibold text-[#7b5f20] shadow-sm">
                          这一题还没选
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={onClose}
                    className="vc-reading-serif min-h-12 rounded-[18px] border border-vc-line-warm bg-vc-paper-bright px-5 text-[1.1rem] font-semibold text-[#0d5a4e] vc-shadow-inset-paper transition-all hover:bg-[#f8f2e8]"
                  >
                    {SURVEY_COPY.later}
                  </button>
                  {surveyUrl ? (
                    <button
                      type="button"
                      onClick={onOpenExternalSurvey}
                      disabled={!surveyConsentUserAgreement || !surveyConsentPrivacyPolicy}
                      className="vc-reading-serif min-h-12 rounded-[18px] border border-vc-line-warm bg-vc-paper-bright px-5 text-[1.1rem] font-semibold text-[#0d5a4e] vc-shadow-inset-paper transition-all hover:bg-[#f8f2e8] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {SURVEY_COPY.externalBackup}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={
                      surveySubmitPending ||
                      safeStep !== totalSteps - 1
                    }
                    onClick={onSubmitSurvey}
                    className="vc-reading-serif min-h-14 rounded-[18px] border border-[#0a403a] bg-[#244f45] px-6 text-[1.35rem] font-semibold text-white shadow-[inset_0_0_0_4px_rgba(255,255,255,0.08),0_10px_22px_rgba(27,79,69,0.18)] transition-all hover:bg-[#1c453d] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {surveySubmitPending ? "提交中…" : SURVEY_COPY.submitEmbedded}
                  </button>
                </div>
              </>
            )}

            <p className="mt-6 text-center text-[12px] leading-relaxed text-[#4f625c]">{SURVEY_COPY.privacyHint}</p>
            {surveyCompletion === "open" ? (
              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={() => onShowBugFeedback(true)}
                  className="vc-reading-serif text-[1rem] text-[#0d5a4e] underline-offset-4 transition hover:underline"
                >
                  {SURVEY_COPY.feedbackSecondary}
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <>
            {!feedbackSuccess ? (
              <>
                <p className="mt-5 text-[13px] leading-relaxed text-[#4f625c]">
                  此为<strong className="font-medium text-[#0d5a4e]">开放文本反馈</strong>
                  ，与结构化产品问卷分渠道存储，便于逐条跟进 bug 与长尾建议。
                </p>
                <div className="mt-7 rounded-[20px] border border-vc-line-warm bg-vc-paper-bright/72 p-4 shadow-[inset_0_0_0_5px_rgba(248,244,237,0.68)]">
                  <label className="vc-reading-serif flex items-start gap-3 text-[1rem] leading-relaxed text-vc-ink-deep">
                    <input
                      type="checkbox"
                      checked={feedbackConsentUserAgreement}
                      onChange={(e) => onFeedbackConsentUserAgreementChange(e.target.checked)}
                      className="mt-1 h-5 w-5 shrink-0 rounded-[6px] border-[#cfc5b6] accent-[#0d5a4e]"
                    />
                    <span>
                      我已阅读并同意{" "}
                      <a className="underline decoration-[#0d5a4e]/45 underline-offset-4 hover:text-[#0d5a4e]" href="/legal/user-agreement">
                        用户协议
                      </a>
                      。
                    </span>
                  </label>
                  <label className="vc-reading-serif mt-4 flex items-start gap-3 text-[1rem] leading-relaxed text-vc-ink-deep">
                    <input
                      type="checkbox"
                      checked={feedbackConsentPrivacyPolicy}
                      onChange={(e) => onFeedbackConsentPrivacyPolicyChange(e.target.checked)}
                      className="mt-1 h-5 w-5 shrink-0 rounded-[6px] border-[#cfc5b6] accent-[#0d5a4e]"
                    />
                    <span>
                      我已阅读并同意{" "}
                      <a className="underline decoration-[#0d5a4e]/45 underline-offset-4 hover:text-[#0d5a4e]" href="/legal/privacy-policy">
                        隐私政策
                      </a>
                      。
                    </span>
                  </label>
                </div>
                <textarea
                  value={feedbackContent}
                  onChange={(event) => onFeedbackContentChange(event.target.value)}
                  placeholder="请输入你的建议或反馈..."
                  className="mt-6 h-56 w-full resize-none rounded-[20px] border border-[#cfc5b6] bg-vc-paper-bright p-4 text-[15px] leading-relaxed text-vc-ink-deep outline-none vc-shadow-inset-paper placeholder:text-[#8b8074] focus:border-[#0d5a4e]"
                />
                <div className="mt-6 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => onShowBugFeedback(false)}
                    className="vc-reading-serif min-h-12 rounded-[18px] border border-vc-line-warm bg-vc-paper-bright px-5 text-[1.1rem] font-semibold text-[#0d5a4e] vc-shadow-inset-paper transition-all hover:bg-[#f8f2e8]"
                  >
                    {SURVEY_COPY.feedbackBack}
                  </button>
                  <button
                    type="button"
                    disabled={feedbackPending || !feedbackConsentUserAgreement || !feedbackConsentPrivacyPolicy}
                    onClick={onSubmitFeedback}
                    className="vc-reading-serif min-h-12 rounded-[18px] border border-[#0a403a] bg-[#244f45] px-5 text-[1.1rem] font-semibold text-white shadow-[inset_0_0_0_4px_rgba(255,255,255,0.08)] transition-all hover:bg-[#1c453d] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {feedbackPending ? "提交中..." : "提交意见"}
                  </button>
                </div>
              </>
            ) : (
              <div className="mt-8 flex min-h-44 items-center justify-center rounded-[22px] border border-vc-line-warm bg-vc-paper-bright/72 p-6 shadow-[inset_0_0_0_5px_rgba(248,244,237,0.68)]">
                <p className="vc-reading-serif text-center text-[1.3rem] font-medium text-[#0d5a4e]">谢谢您的意见，游戏会因您变得更好！</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
