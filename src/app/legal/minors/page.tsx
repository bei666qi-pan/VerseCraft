import { LegalDocShell } from "@/components/legal/LegalDocShell";
import { getPublicRuntimeConfig } from "@/lib/config/publicRuntime";

export const metadata = {
  title: "未成年人说明 - 文界工坊 VerseCraft",
  description: "未成年人使用提示与个人信息说明。",
};

export default function MinorsPage() {
  const cfg = getPublicRuntimeConfig();
  const c = cfg.compliance;
  const contactEmail = c.contactEmail;
  const contactLine = contactEmail ? `联系邮箱：${contactEmail}` : "联系方式请以联系我们页面为准。";
  const showMinors = c.showMinors;

  return (
    <LegalDocShell title="未成年人说明">
      <div className="space-y-5 text-sm text-slate-700">
        {!showMinors ? (
          <p className="text-slate-600">
            未成年人说明当前未在公测期开放展示。你仍可通过「联系我们」提交相关问题或请求。{contactLine}
          </p>
        ) : null}
        {showMinors ? (
          <>
        <p className="text-slate-600">本说明旨在帮助未成年人及其监护人更好地理解本产品的使用边界。</p>

        <h2 className="text-base font-semibold text-slate-900">1. 产品目前面向何类用户</h2>
        <p>
          本产品主要面向完成注册并遵守社区规则的用户群体。若你是未成年人，请务必在监护人指导下使用。
        </p>

        <h2 className="text-base font-semibold text-slate-900">2. 未成年人应在监护人指导下使用的提示</h2>
        <p>
          未成年人应在监护人了解并同意的前提下使用本产品。监护人应关注孩子的在线时间与交互内容，必要时及时停止使用。
        </p>

        <h2 className="text-base font-semibold text-slate-900">3. 不鼓励沉迷，合理安排时间</h2>
        <p>
          我们不鼓励未成年人沉迷游戏或过度交互。请合理控制使用频率与时长，并注意学习与休息。
        </p>

        <h2 className="text-base font-semibold text-slate-900">4. 发现未成年人个人信息处理问题怎么办</h2>
        <p className="text-slate-600">
          若你发现未成年人个人信息处理存在问题，请通过「联系我们」页面提交相关请求。{contactLine}
        </p>
          </>
        ) : null}
      </div>
    </LegalDocShell>
  );
}

