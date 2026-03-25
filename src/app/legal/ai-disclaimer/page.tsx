import { LegalDocShell } from "@/components/legal/LegalDocShell";
import { getPublicRuntimeConfig } from "@/lib/config/publicRuntime";

export const metadata = {
  title: "AI 生成说明 - VerseCraft versecraft.cn",
  description: "VerseCraft 人工智能生成内容说明、安全与纠错渠道（versecraft.cn）。",
};

export default function AiDisclaimerPage() {
  const cfg = getPublicRuntimeConfig();
  const c = cfg.compliance;
  const contactEmail = c.contactEmail;
  const contactLine =
    contactEmail !== null
      ? `纠错与举报联系邮箱：${contactEmail}。`
      : `请通过「联系我们」页面提交，主题注明「AI 内容纠错」或「AI 安全举报」。`;

  return (
    <LegalDocShell title="人工智能（AI）生成内容说明">
      <article className="space-y-6 text-sm leading-relaxed text-slate-700">
        <p className="text-slate-600">
          VerseCraft（{c.officialDomain}）在叙事互动、剧情推演、选项生成、意图理解等场景中
          <strong className="font-medium text-slate-800"> 使用生成式人工智能模型或模型组合</strong>。
          本说明阐述 AI 能力的边界、风险与我们的安全措施，并与《用户协议》《隐私政策》《内容规范》一并阅读。
          <strong className="font-medium text-slate-800">
            {" "}
            本说明不构成对模型输出正确性、合法性或适用性的担保；相关义务以实际运营、适用法律及必要法律意见为准。
          </strong>
        </p>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">一、本产品包含 AI 生成或 AI 辅助生成内容</h2>
          <p>
            您在本产品中看到的部分叙事文本、对话回复、剧情分支建议、系统提示或辅助说明，可能完全或部分由 AI 自动生成，并可能经过规则引擎、模板或人工流程的后处理。
            同一输入在不同时间可能产生不同输出，属于生成式模型的正常现象。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">二、生成结果的局限性</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>可能出现事实错误、逻辑跳跃、前后矛盾或与游戏内设定不一致的情况；</li>
            <li>可能产生「看似合理但事实虚构」的内容（俗称幻觉）；</li>
            <li>可能对敏感话题给出不恰当或不完整的回应；</li>
            <li>受上下文长度、模型版本、算力与安全策略影响，输出质量存在波动。</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">三、哪些场景下 AI 输出不能作为专业依据</h2>
          <p>
            <strong className="font-medium text-slate-800">
              AI 输出仅供互动娱乐与剧情体验参考，不得作为医疗诊断、用药、治疗、法律意见、诉讼策略、投融资决策、税务筹划等专业事项的依据。
            </strong>
            您应咨询具备资质的专业人士并以书面意见为准。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">四、我们采取的安全措施（概述）</h2>
          <p>我们会在产品架构与运营流程中叠加多类控制措施，包括但不限于（以实际部署为准）：</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>输入与输出策略：</strong>通过系统提示、规则与模型参数降低违规与高风险内容出现概率；
            </li>
            <li>
              <strong>自动拦截与过滤：</strong>对接内容安全服务或自建策略，对疑似违法违规内容进行阻断、替换或拒绝响应；
            </li>
            <li>
              <strong>限流与滥用防护：</strong>对异常流量、高频请求与可疑账号进行限速、熔断或人机验证等处置；
            </li>
            <li>
              <strong>日志与审计：</strong>在合理范围内记录请求元数据、策略命中摘要与错误信息，用于排障、风控与合规留痕；
            </li>
            <li>
              <strong>人工介入：</strong>在重大安全事件、投诉升级或监管要求场景下，可能启动人工核查。
            </li>
          </ul>
          <p className="text-xs text-slate-500">
            上述措施<strong>不能等同于「零风险」或「完全杜绝」</strong>有害内容；若您发现漏网之例，请立即通过举报渠道告知我们。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">五、用户输入进入 AI 服务处理的边界</h2>
          <p>
            为实现对话与剧情续写，您主动输入的文本及为维持上下文连贯而必需的历史对话片段，可能被传送至 AI 网关及后端模型提供方处理。
            处理地点与跨境情况取决于基础设施配置；我们依法采取合同与安全技术措施，但
            <strong className="font-medium text-slate-800"> 无法向您保证第三方基础设施在每一时点均位于特定司法辖区</strong>。
            更多个人信息处理规则见《隐私政策》。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">六、举报、纠错与申诉</h2>
          <p>
            若您认为 AI 输出涉嫌违法违规、侵害权益或严重偏离产品应有调性，请通过「联系我们」提交材料，说明时间、场景、对话片段与您的诉求。{contactLine}
          </p>
          <p>我们将在合理期限内评估并采取删除、屏蔽、调整策略或模型路由等措施之一或多项；复杂案件可能需多次沟通。</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">七、AI 辅助审核或风控的披露</h2>
          <p>
            部分场景下，我们可能使用自动化规则、统计模型或 AI 辅助工具对内容、行为或风险信号进行排序、标注或建议，
            <strong className="font-medium text-slate-800"> 最终是否采取措施仍由我们的运营与安全策略在人工监督下决定（视案件等级而定）</strong>。
            该等辅助决策可能影响您的使用体验或账号状态；您享有《内容规范》所载申诉权利。
          </p>
        </section>
      </article>
    </LegalDocShell>
  );
}
