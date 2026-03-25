import { LegalDocShell } from "@/components/legal/LegalDocShell";
import { getPublicRuntimeConfig } from "@/lib/config/publicRuntime";

export const metadata = {
  title: "未成年人使用说明 - VerseCraft versecraft.cn",
  description: "VerseCraft 未成年人使用提示、个人信息与防沉迷边界说明（versecraft.cn）。",
};

export default function MinorsPage() {
  const cfg = getPublicRuntimeConfig();
  const c = cfg.compliance;
  const contactEmail = c.contactEmail;
  const contactLine =
    contactEmail !== null
      ? `监护人或权利人联系邮箱：${contactEmail}。`
      : `请通过「联系我们」页面提交，主题注明「未成年人相关」。`;

  return (
    <LegalDocShell title="未成年人使用说明">
      <article className="space-y-6 text-sm leading-relaxed text-slate-700">
        <p className="text-slate-600">
          本说明适用于访问或使用 VerseCraft（{c.officialDomain}）的未成年人及其监护人。
          本产品包含文字互动、悬疑与轻度紧张氛围的叙事元素，以及由人工智能参与生成的动态内容，可能不适合低龄儿童在无监护情况下独自长时间使用。
          <strong className="font-medium text-slate-800">
            {" "}
            本说明与《隐私政策》《用户协议》不一致时，就未成年人保护优先适用更严格者；具体权利义务仍以适用法律与监管要求为准。
          </strong>
        </p>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">一、产品适用对象与使用提示</h2>
          <p>
            本产品主要面向具备一定阅读理解能力与情绪自我调节能力的用户。若未成年人使用，监护人应评估其心理承受能力与上网习惯，避免在夜间或独处场景下长时间沉浸。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">二、建议在监护人指导下使用</h2>
          <p>
            我们建议监护人与未成年人共同阅读《用户协议》《隐私政策》及本说明，就账号注册、付费（如未来上线）、社交互动（如未来上线）等事项事先沟通并设定规则。
            监护人发现未成年人未经同意注册或提供过多个人信息时，可联系我们处理（在适用法律与技术可行范围内）。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">三、不鼓励沉迷，合理安排时间</h2>
          <p>
            我们不鼓励未成年人过度使用网络游戏或互动叙事产品。请合理安排学习与休息，注意用眼卫生与作息。
            <strong className="font-medium text-slate-800">
              {" "}
              当前产品形态以剧情与选项互动为主，是否纳入特定行业防沉迷监管以监管规则更新及我们公告为准。
            </strong>
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">四、涉及未成年人个人信息的处理</h2>
          <p>
            我们仅在合法、正当、必要和诚信的原则下处理未成年人个人信息。监护人可依法行使查阅、更正、删除等权利，具体路径见《隐私政策》。
            {contactLine}
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">五、关于实名认证、限时与防沉迷的当前边界（重要）</h2>
          <p>
            <strong className="font-medium text-slate-800">
              截至本页发布时，本产品未必已单独上线与网络游戏防沉迷实名认证系统完全等同的全套机制（例如强制身份证实名、统一时长限制等），具体以您实际看到的注册与认证流程为准。
            </strong>
            我们如实披露该边界，不在此虚假承诺已具备特定行政许可或技术能力。
            随着法规与产品迭代，我们可能增加或调整未成年人保护措施，并将通过更新本说明、弹窗或站内公告等方式提示重大变化。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">六、内容与气质提示</h2>
          <p>
            本产品世界观可能包含悬疑、压迫感、轻度恐怖氛围或道德两难情境，旨在叙事体验而非现实指引。
            若未成年人感到不适，应立即停止使用并告知监护人；监护人可联系我们反馈以便我们评估内容分级与提示策略的改进空间。
          </p>
        </section>

        {c.showMinors ? (
          <p className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            提示：运营方已启用「未成年人专项展示」相关配置（NEXT_PUBLIC_SHOW_MINORS），您仍应结合本说明全文理解产品边界。
          </p>
        ) : null}
      </article>
    </LegalDocShell>
  );
}
