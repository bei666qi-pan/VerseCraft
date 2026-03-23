import { LegalDocShell } from "@/components/legal/LegalDocShell";
import { getPublicRuntimeConfig } from "@/lib/config/publicRuntime";

export const metadata = {
  title: "法律中心 - 文界工坊 VerseCraft",
  description: "用户协议、隐私政策、内容规范与 AI 生成说明等合规文件。",
};

export default function LegalIndexPage() {
  const cfg = getPublicRuntimeConfig();
  const c = cfg.compliance;
  const showMinors = c.showMinors;

  return (
    <LegalDocShell title="法律中心">
      <div className="space-y-4 text-slate-700">
        <p className="text-sm text-slate-600">
          以下为公测期基础合规文件入口。为便于阅读，已按功能分类整理。
        </p>

        <ul className="space-y-2 text-sm">
          <li>
            <a className="text-slate-800 underline underline-offset-4" href="/legal/user-agreement">
              用户协议
            </a>
          </li>
          <li>
            <a className="text-slate-800 underline underline-offset-4" href="/legal/privacy-policy">
              隐私政策
            </a>
          </li>
          <li>
            <a className="text-slate-800 underline underline-offset-4" href="/legal/contact">
              联系我们（测试反馈 / 举报）
            </a>
          </li>
          <li>
            <a className="text-slate-800 underline underline-offset-4" href="/legal/content-policy">
              内容规范 / 社区规则
            </a>
          </li>
          <li>
            <a className="text-slate-800 underline underline-offset-4" href="/legal/ai-disclaimer">
              AI 生成说明
            </a>
          </li>
          {showMinors ? (
            <li>
              <a className="text-slate-800 underline underline-offset-4" href="/legal/minors">
                未成年人说明
              </a>
            </li>
          ) : null}
        </ul>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm text-slate-600">
            如果你希望我们进一步完善合规说明，请在「联系我们」中选择「测试反馈 / 举报」并注明需求。
          </p>
        </div>
      </div>
    </LegalDocShell>
  );
}

