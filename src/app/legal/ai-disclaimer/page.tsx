import { LegalDocShell } from "@/components/legal/LegalDocShell";
import { getPublicRuntimeConfig } from "@/lib/config/publicRuntime";

export const metadata = {
  title: "AI 生成说明 - 文界工坊 VerseCraft",
  description: "AI 生成内容的局限性与使用边界说明。",
};

export default function AiDisclaimerPage() {
  const cfg = getPublicRuntimeConfig();
  const c = cfg.compliance;
  const contactEmail = c.contactEmail;
  const contactLine = contactEmail ? `联系邮箱：${contactEmail}` : "联系方式请以联系我们页面为准。";

  return (
    <LegalDocShell title="AI 生成说明">
      <div className="space-y-5 text-sm text-slate-700">
        <p className="text-slate-600">
          文界工坊 VerseCraft 可能包含 AI 生成或 AI 辅助生成的内容，用于改善互动体验与创作辅助。
        </p>

        <h2 className="text-base font-semibold text-slate-900">1. 本产品含 AI 生成内容</h2>
        <p>
          你可能会看到由模型生成的文本、剧情片段、建议或解释等内容。上述内容用于娱乐与体验优化目的。
        </p>

        <h2 className="text-base font-semibold text-slate-900">2. 局限性</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>AI 结果可能不准确、不完整；</li>
          <li>可能出现虚构或偏差内容；</li>
          <li>不同情境下可能表现差异。</li>
        </ul>

        <h2 className="text-base font-semibold text-slate-900">3. 不应作为专业依据</h2>
        <p>
          请不要将 AI 生成内容作为法律、医疗、金融或其他专业建议的唯一依据。你应自行判断并对自己的决策负责。
        </p>

        <h2 className="text-base font-semibold text-slate-900">4. 持续优化但不作承诺</h2>
        <p>
          我们会持续优化模型调用策略与安全策略，但不保证所有生成结果均绝对正确或完全符合你的预期。
        </p>

        <h2 className="text-base font-semibold text-slate-900">5. 违规输入与投诉处理</h2>
        <p className="text-slate-600">
          若你认为存在违规生成或不当内容，可通过「联系我们」页面选择「举报投诉」提交。{contactLine}
        </p>
      </div>
    </LegalDocShell>
  );
}

