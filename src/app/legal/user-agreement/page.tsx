import { LegalDocShell } from "@/components/legal/LegalDocShell";
import { getPublicRuntimeConfig } from "@/lib/config/publicRuntime";

export const metadata = {
  title: "用户协议 - VerseCraft versecraft.cn",
  description: "VerseCraft（versecraft.cn）用户服务协议（公测/正式版结构）。",
};

export default function UserAgreementPage() {
  const cfg = getPublicRuntimeConfig();
  const c = cfg.compliance;
  const productName = c.productName ?? "VerseCraft（文界工坊）";
  const contactEmail = "bei666qi@gmail.com";
  const contactEmailLine = `官方联系邮箱：${contactEmail}。`;
  const contactBlock = [
    contactEmailLine,
    `请优先通过「联系我们」页面（${c.officialSiteUrl}/legal/contact）在线提交以便生成受理参考号。`,
  ]
    .filter(Boolean)
    .join("");
  const effective = c.legalEffectiveDate ?? "见本页首段公示；更新后以页面所载新版本为准";
  const testNote = c.isTestPeriod
    ? "当前处于公测或功能验证阶段，部分能力、数据留存策略或服务可用性可能调整，我们会通过页面提示、公告或版本说明等方式告知重要变化。"
    : "我们可能因产品迭代调整功能范围，涉及您重大权益的变化将尽量以合理方式提示。";

  return (
    <LegalDocShell title="用户协议">
      <article className="space-y-6 text-sm leading-relaxed text-slate-700">
        <p className="text-slate-600">
          欢迎您使用 {productName}（以下简称「本产品」或「我们」）。您通过网络域名 <strong>{c.officialDomain}</strong> 及其指向的网站与相关客户端访问、注册、登录或使用本产品功能，即表示您已阅读、理解并同意受本协议约束。
          若您不同意，请停止使用。本协议正文与附件（包括《隐私政策》《内容规范》《AI
          生成说明》等通过链接引用且依法构成合同组成部分的文件）共同构成您与我们之间的约定。
          <strong className="font-medium text-slate-800"> 相关义务以实际运营、适用法律、监管要求及必要时专业法律意见为准。</strong>
        </p>
        <p className="text-xs text-slate-500">生效日期：{effective}。</p>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">一、协议主体与适用范围</h2>
          <p>
            1.1 本协议由您与本产品运营方共同缔结。运营主体名称以本页页眉及页脚公示为准；若暂未公示，以「联系我们」页面所载为准。
          </p>
          <p>
            1.2 本协议适用于您使用本产品提供的文字冒险、互动叙事、账号与存档同步、与生成式人工智能相关的交互等全部在线服务（统称「本服务」），除非单项规则另有说明。
          </p>
          <p>1.3 若您代表组织使用本服务，您声明已获得充分授权并使该组织受本协议约束。</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">二、网站、域名与备案信息</h2>
          <p>
            2.1 本产品官方网站为{" "}
            <a className="text-slate-900 underline underline-offset-2" href={c.officialSiteUrl} target="_blank" rel="noreferrer">
              {c.officialSiteUrl}
            </a>
            ，主域名为 {c.officialDomain}。
          </p>
          <p>
            2.2 ICP 备案号：{c.beianNumber}。您可通过{" "}
            <a className="text-slate-900 underline underline-offset-2" href={c.beianUrl} target="_blank" rel="noreferrer">
              备案管理部门公示渠道
            </a>{" "}
            查询备案信息。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">三、服务内容与测试期边界</h2>
          <p>3.1 本服务包括但不限于：账户体系、游戏进度与设置、与剧情/选项相关的交互、可能涉及的云存档同步、与 AI 相关的生成与辅助能力、为安全与体验所必需的风控与日志能力等。具体以您实际可使用的产品界面为准。</p>
          <p>3.2 {testNote}</p>
          <p>
            3.3 <strong className="font-medium text-slate-800">页面声明不能替代产品实现。</strong>
            例如：内容安全策略须通过拦截、限流、处置等机制落实；数据权利请求须通过可验证的受理渠道处理。我们持续完善相关能力，但不保证在每一时点均已达到您主观预期的完备程度。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">四、账号规则与用户义务</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>您应使用真实、准确、合法的信息完成注册或第三方授权登录，并妥善保管凭证；因您保管不善导致的损失，由您自行承担合理范围内的风险。</li>
            <li>禁止冒用他人身份、恶意注册、买卖账号、共享账号用于规避安全策略或quota 等行为。</li>
            <li>您的账号下行为视为您本人行为；除非可证明账号被盗用且您及时按指引通知我们，我们将在合理范围内协助排查。</li>
            <li>我们有权基于安全、合规或运营需要，要求您补充信息或限制异常账号功能，该等措施将在适用法律允许的范围内实施。</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">五、用户输入、生成内容与反馈的权利边界</h2>
          <p>
            5.1 您在服务中输入的文本、选项、反馈、问卷内容等（「用户输入」），以及经本产品处理形成的展示或存档数据，其知识产权归属依法确定。您应保证就用户输入享有相应权利或已获得合法授权，且不侵害第三方合法权益。
          </p>
          <p>
            5.2 为提供、改进与安全保障之目的，您授予我们在全球范围内、非独占、可转授权的许可，使我们得以在必要范围内存储、复制、处理、展示、分析与用于模型安全与防滥用的用户输入及交互记录；该许可在您删除依法可删除的数据或注销后，以技术可行与法律允许为限终止或缩减。
          </p>
          <p>
            5.3 由 AI 生成的内容可能具有不确定性，不构成我们对任何事实或观点的背书。详见《AI 生成说明》。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">六、禁止行为（分类）</h2>
          <p className="font-medium text-slate-800">6.1 违法与有害内容</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>违反中华人民共和国法律法规、部门规章或监管要求的内容或行为；</li>
            <li>危害国家安全、破坏社会稳定、宣扬恐怖主义与极端主义、煽动民族仇恨、传播淫秽色情、赌博、暴力恐吓、教唆犯罪等；</li>
            <li>侵犯他人名誉权、隐私权、肖像权、知识产权及其他合法权益。</li>
          </ul>
          <p className="font-medium text-slate-800">6.2 滥用与技术对抗</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>对服务、接口、模型进行恶意爬取、逆向、绕过安全策略、注入攻击、DDoS 等；</li>
            <li>使用脚本、自动化工具不合理占用资源、刷单、刷接口、恶意注册；</li>
            <li>利用漏洞获取未授权数据或干扰他人使用，或隐瞒漏洞牟取不当利益。</li>
          </ul>
          <p className="font-medium text-slate-800">6.3 欺诈与骚扰</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>冒充我们或他人、钓鱼、诈骗、传销或诱导用户提供敏感信息；</li>
            <li>对其他用户或公众进行骚扰、威胁、人肉搜索或恶意引流。</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">七、服务中断、修改与终止</h2>
          <p>7.1 我们可能因系统维护、升级、网络故障、第三方服务异常、不可抗力或合规要求等原因中断或限制部分服务。我们将尽可能在合理范围内进行公告或提示，但无法保证事先逐一通知到每一位用户。</p>
          <p>7.2 我们有权根据业务调整变更、替换或下线功能；如涉及您已付费权益（若未来上线），以届时专项规则为准。</p>
          <p>7.3 您可随时停止使用；我们可在您严重违约或法律法规要求时，暂停或终止向您提供部分或全部服务，并依法留存必要记录。</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">八、知识产权</h2>
          <p>8.1 本产品中的软件、界面设计、商标、图文模板、剧情框架中的原创表达及我们享有权利的内容，受著作权法、商标法等相关法律保护。未经许可，您不得复制、传播或用于商业性再利用。</p>
          <p>8.2 您保留对用户输入的合法权利；因用户输入引起的第三方主张，您应承担首要责任，我们在法律要求或合理范围内可予以配合。</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">九、AI 内容的特别边界</h2>
          <p>
            本产品包含 AI 生成或 AI 辅助生成内容。AI 输出可能存在错误、虚构或不适用于您的具体情境。
            <strong className="font-medium text-slate-800"> 您不得将其作为医疗、法律、金融等专业决策的唯一依据。</strong>
            详细说明见《AI 生成说明》。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">十、责任范围与限制（非「免除一切责任」）</h2>
          <p>
            10.1 我们致力于在合理商业努力下保障服务稳定与安全，但受技术条件、网络环境与第三方依赖影响，<strong className="font-medium text-slate-800">我们不保证服务无中断、无错误或无安全事件</strong>。
          </p>
          <p>
            10.2 在适用法律允许的最大范围内，对因使用或无法使用本服务而产生的间接损失、纯粹经济利益损失、数据丢失（含您未自行备份部分）等，我们将在依法应承担的责任边界内承担责任；
            <strong className="font-medium text-slate-800"> 我们不作出「零风险」「绝对合法」「不承担任何责任」等不当承诺</strong>。
            若强制性法律规定不得排除或限制某项责任，以该规定为准。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">十一、违规处置机制</h2>
          <p>
            我们有权依据《内容规范》、本协议及内部风控规则，对违规内容与行为采取警示、删除、限制功能、短期封禁、永久终止服务等措施，并依法向主管部门报告。
            处置将结合情节、主观恶意、影响范围等因素综合判断，<strong className="font-medium text-slate-800">具体结果以我们核查结论为准，但您享有申诉渠道</strong>。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">十二、投诉、举报与申诉</h2>
          <p>
            您可通过「联系我们」页面使用<strong>在线提交</strong>发送测试反馈、举报投诉或申诉；系统将写入服务端受理记录并生成<strong>受理参考号</strong>（形如{" "}
            <code className="text-xs">VC-COMP-编号</code>）以便留痕。请尽量提供时间、账号标识、截图、文本片段等可核查信息。{contactBlock}
            我们将在合理期限内处理，但受人力与案件复杂度影响，<strong className="font-medium text-slate-800">不承诺固定完成时点</strong>；当前阶段亦<strong>无</strong>完整工单流转后台。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">十三、适用法律与争议解决</h2>
          <p>
            13.1 本协议的订立、效力、解释与履行，适用中华人民共和国大陆地区法律（不含冲突法）。
          </p>
          <p>
            13.2 因本协议引起的争议，双方应首先友好协商；协商不成的，<strong className="font-medium text-slate-800">您同意将争议提交至本协议运营主体住所地有管辖权的人民法院诉讼解决</strong>（若法律对消费者权益另有强制性管辖规定，从其规定）。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">十四、协议更新与生效方式</h2>
          <p>14.1 我们可能修订本协议；修订后版本将在本产品内公示并标注更新日期。若修订限制您的权利或加重您的义务，我们将尽量以显著方式提示。</p>
          <p>14.2 您在更新生效后继续使用本服务，视为接受修订；若您不同意，应停止使用并可根据《隐私政策》申请处理您的个人信息（在适用范围内）。</p>
        </section>
      </article>
    </LegalDocShell>
  );
}
