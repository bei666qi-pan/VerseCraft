import { LegalDocShell } from "@/components/legal/LegalDocShell";
import { getPublicRuntimeConfig } from "@/lib/config/publicRuntime";

export const metadata = {
  title: "内容规范 / 社区规则 - 文界工坊 VerseCraft",
  description: "公测期内容规范与社区规则。",
};

export default function ContentPolicyPage() {
  const cfg = getPublicRuntimeConfig();
  const c = cfg.compliance;
  const contactEmail = c.contactEmail;
  const contactLine = contactEmail ? `联系邮箱：${contactEmail}` : "联系方式请以联系我们页面为准。";

  return (
    <LegalDocShell title="内容规范 / 社区规则">
      <div className="space-y-5 text-sm text-slate-700">
        <p className="text-slate-600">
          为维护社区安全与创作氛围，你需遵守以下规则。违规内容可能被删除或影响账号可用性。
        </p>

        <h2 className="text-base font-semibold text-slate-900">1. 禁止违法违规内容</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>发布或传播违法违规信息；</li>
          <li>传播淫秽色情、暴力恐怖、侮辱诽谤、仇恨、诈骗等内容；</li>
          <li>侵害他人隐私、名誉或其他合法权益。</li>
        </ul>

        <h2 className="text-base font-semibold text-slate-900">2. 禁止利用系统生成违规内容</h2>
        <p>
          你不得通过提示词、指令或其他方式诱导模型生成违法违规内容。我们可能对违规输入与输出进行拦截与必要记录。
        </p>

        <h2 className="text-base font-semibold text-slate-900">3. 禁止恶意刷接口、刷号与破坏服务</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>使用脚本或自动化方式进行频繁请求；</li>
          <li>进行刷号、恶意注册、扰乱社区秩序；</li>
          <li>利用漏洞、篡改数据或破坏服务运行。</li>
        </ul>

        <h2 className="text-base font-semibold text-slate-900">4. 对违规内容的处理方式</h2>
        <p>
          我们可能采取删除内容、限制功能、暂停或终止账号等措施，并保留依法处理的权利。处理结果以实际审核为准。
        </p>

        <h2 className="text-base font-semibold text-slate-900">5. 举报与申诉方式</h2>
        <p className="text-slate-600">
          如你发现违规内容，请在「联系我们」页面选择「举报投诉」提交。申诉同样可通过联系我们页面提出。{contactLine}
        </p>
      </div>
    </LegalDocShell>
  );
}

