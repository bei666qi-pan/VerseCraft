import { LegalDocShell } from "@/components/legal/LegalDocShell";
import { getPublicRuntimeConfig } from "@/lib/config/publicRuntime";

export const metadata = {
  title: "用户协议 - 文界工坊 VerseCraft",
  description: "用户协议（公测期基础合规）。",
};

export default function UserAgreementPage() {
  const cfg = getPublicRuntimeConfig();
  const c = cfg.compliance;
  const contactEmail = c.contactEmail;
  const contactLine = contactEmail ? `联系邮箱：${contactEmail}` : "联系信息请以联系我们页面为准。";
  const effective = c.legalEffectiveDate ?? "（以页面展示为准）";
  const subjectLine = c.operatingSubject ? `运营主体：${c.operatingSubject}` : "";
  const productName = c.productName ?? "文界工坊 VerseCraft";

  return (
    <LegalDocShell title="用户协议">
      <div className="space-y-5 text-sm text-slate-700">
        <p className="text-slate-600">
          本协议由你与 {productName} 提供方共同订立。{subjectLine ? subjectLine : ""}生效日期：{effective}。
        </p>

        <h2 className="text-base font-semibold text-slate-900">1. 服务说明</h2>
        <p>
          你将通过本网站及相关客户端体验文界工坊的文字冒险与交互服务。我们会根据产品迭代调整功能范围与展示内容，但不会降低你对本协议的基本权益。
        </p>

        <h2 className="text-base font-semibold text-slate-900">2. 账号与使用规则</h2>
        <p>
          你应使用真实有效的信息完成注册或登录。不得冒用他人名义、虚构身份或滥用账号。你应对账号下的所有行为负责。
        </p>

        <h2 className="text-base font-semibold text-slate-900">3. 用户内容发布与使用边界</h2>
        <p>
          若你在服务中发布文本、剧情、反馈、建议等内容，你保证该内容不侵犯他人合法权益，并符合内容规范。我们可能为提供服务对内容进行必要的展示、索引与处理。
        </p>

        <h2 className="text-base font-semibold text-slate-900">4. 禁止行为</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>发布或传播违法违规信息、淫秽色情、暴力恐怖、侮辱诽谤、诈骗或仇恨内容；</li>
          <li>利用系统漏洞、自动化脚本或恶意刷接口、刷号来破坏服务；</li>
          <li>试图绕过安全策略或进行逆向、爬取、篡改等行为；</li>
          <li>上传或发布侵犯他人知识产权或隐私的内容。</li>
        </ul>

        <h2 className="text-base font-semibold text-slate-900">5. AI 生成内容的局限性说明</h2>
        <p>
          本服务可能包含 AI 生成或 AI 辅助生成的内容。AI 结果可能存在不准确、不完整、虚构或偏差。你应将其作为参考而非专业建议。对你因此作出的决策与行为，你应自行承担责任。
        </p>

        <h2 className="text-base font-semibold text-slate-900">6. 违规处理机制</h2>
        <p>
          若你违反法律法规或本协议约定，我们可能采取警告、限制使用、删除违规内容、暂停或终止你的账号等措施。情节严重的，我们将保留依法追究的权利。
        </p>

        <h2 className="text-base font-semibold text-slate-900">7. 服务中断、变更、终止说明</h2>
        <p>
          为保障安全与运行稳定，我们可能进行维护、升级或调整服务。若需要终止服务，我们会尽可能提前通知并处理你的账号数据归属与导出事宜（如适用）。
        </p>

        <h2 className="text-base font-semibold text-slate-900">8. 知识产权说明</h2>
        <p>
          除你依法享有的权利外，本服务的技术、代码、页面布局、商标、内容模板等受相关知识产权保护。你发布的内容由你享有相应权利，但你授予我们在提供服务所必需的范围内使用、展示与处理的权利。
        </p>

        <h2 className="text-base font-semibold text-slate-900">9. 免责声明边界</h2>
        <p>
          我们尽力保证服务的稳定与准确性，但不对任何内容的完整性、准确性、及时性或适用性作出保证。对因不可抗力、第三方服务故障或你自身操作产生的损失，我们不承担责任。
        </p>

        <h2 className="text-base font-semibold text-slate-900">10. 联系方式</h2>
        <p className="text-slate-600">{contactLine}</p>

        <h2 className="text-base font-semibold text-slate-900">11. 协议更新方式与生效时间</h2>
        <p>
          我们可能不时修订本协议。修订后的内容将在页面展示并标注生效日期。你继续使用服务即表示你接受修订后的协议。
        </p>
      </div>
    </LegalDocShell>
  );
}

