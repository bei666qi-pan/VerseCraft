import { LegalDocShell } from "@/components/legal/LegalDocShell";
import { getPublicRuntimeConfig } from "@/lib/config/publicRuntime";

export const metadata = {
  title: "内容规范与社区规则 - VerseCraft versecraft.cn",
  description: "VerseCraft 可执行的内容规范、违规分类、处置与申诉（versecraft.cn）。",
};

export default function ContentPolicyPage() {
  const cfg = getPublicRuntimeConfig();
  const c = cfg.compliance;
  const contactEmail = c.contactEmail;
  const contactLine =
    contactEmail !== null
      ? `举报与申诉联系邮箱：${contactEmail}。`
      : `请通过「联系我们」页面选择相应主题提交材料。`;

  return (
    <LegalDocShell title="内容规范与社区规则">
      <article className="space-y-6 text-sm leading-relaxed text-slate-700">
        <p className="text-slate-600">
          为维护网络秩序、保护用户合法权益并落实内容安全义务，制定本规范。您在使用 VerseCraft（{c.officialDomain}）时，须同时遵守国家法律法规及本规范。
          <strong className="font-medium text-slate-800">
            {" "}
            本规范是页面声明与产品内技术、运营处置的共同依据；具体认定与裁量以我们核查为准，但不排除监管机关的独立认定。
          </strong>
        </p>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">0、与安全策略体系的关系（重要）</h2>
          <p>
            我们会对<strong>用户输入</strong>与<strong>系统输出</strong>进行内容安全审查。审查可能综合使用外部文本审核引擎信号（例如百度文本审核/司南相关能力）与本地场景化策略，并结合白名单与安全回退机制进行综合裁决。
            外部审核结果并非唯一判断依据；平台可能采取阻断、改写、安全回退或拒绝展示等措施，并保留必要的安全留痕用于风控与争议处理。
            对于争议或疑似误判，我们也可能基于投诉举报与申诉复核结果进行进一步处理。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">一、违规内容分类</h2>
          <p className="font-medium text-slate-800">1.1 违法违规类</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>反对宪法确定的基本原则，危害国家安全、泄露国家秘密、颠覆国家政权、破坏国家统一；</li>
            <li>损害国家荣誉和利益，煽动民族仇恨、民族歧视、破坏民族团结；</li>
            <li>破坏国家宗教政策，宣扬邪教和封建迷信；</li>
            <li>散布谣言、扰乱经济与社会秩序，或破坏社会稳定；</li>
            <li>淫秽、色情、赌博、暴力、凶杀、恐怖或教唆犯罪；</li>
            <li>侮辱、诽谤他人，侵害他人名誉、隐私、肖像、知识产权等合法权益；</li>
            <li>法律、行政法规禁止的其他内容。</li>
          </ul>
          <p className="font-medium text-slate-800">1.2 严重不良信息类</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>展示或诱导自残、自杀、危险行为模仿的细节化描述；</li>
            <li>过度血腥、令人极度不适的暴力描写（即使在虚构叙事中）；</li>
            <li>针对特定群体的仇恨言论、歧视性标签化攻击。</li>
          </ul>
          <p className="font-medium text-slate-800">1.3 欺诈与违法指引类</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>诈骗、传销、非法集资、洗钱或其他经济犯罪相关话术与指引；</li>
            <li>传授违法犯罪方法、规避监管或侵犯他人系统的操作步骤；</li>
            <li>售卖或推广法律禁止或限制流通的物品与服务。</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">二、违规输入、违规生成与违规传播</h2>
          <p>
            <strong className="font-medium text-slate-800">2.1 违规输入：</strong>
            您不得以提示词、剧情引导、选项设计等方式故意诱导系统输出本规范所述违法违规内容；不得以角色扮演、剧情包装等方式诱导绕过审核。
            不得上传含有违法违规、可用于引流/诈骗/骚扰/攻击的原始文本用于生成或传播。
          </p>
          <p>
            <strong className="font-medium text-slate-800">2.2 违规生成：</strong>
            即便由 AI 自动生成，一旦内容落入禁止类别，您不得继续要求重复生成、变体生成或截图传播以规避拦截或引发违规传播。
          </p>
          <p>
            <strong className="font-medium text-slate-800">2.3 违规传播：</strong>
            您不得将本产品内获取的违规或经拦截前的有害内容对外复制、转载、售卖或用于训练其他模型等用途。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">三、骚扰、诈骗、色情、暴恐、仇恨、违法指引（执行要点）</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>骚扰：</strong>反复滋扰其他用户、工作人员或公众，人肉搜索、威胁恐吓、恶意 PUA 式操控等均属禁止行为。
            </li>
            <li>
              <strong>诈骗：</strong>冒充官方、客服、合作方或他人身份索取密码、验证码、支付信息的一律禁止。
            </li>
            <li>
              <strong>色情：</strong>具体性行为描写、性交易招揽、儿童性相关内容等，无论真人或虚构，均属严格禁止。
            </li>
            <li>
              <strong>暴恐：</strong>宣扬恐怖主义、极端主义，或提供可用于实施暴力犯罪的可操作细节。
            </li>
            <li>
              <strong>仇恨：</strong>基于种族、民族、宗教、性别、地域、疾病等的系统性贬损与煽动对立。
            </li>
            <li>
              <strong>违法指引：</strong>教唆吸毒、制爆、黑客入侵、伪造证件等，一律禁止。
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">四、系统滥用与安全对抗</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>使用脚本、机器人、爬虫等自动化手段高频访问接口、批量注册、撞库、刷额度或干扰公平性；</li>
            <li>利用或传播漏洞、绕过内容安全与鉴权机制、篡改客户端或服务端数据；</li>
            <li>对工作人员进行威胁、贿赂以获取未公开接口或数据；</li>
            <li>其他破坏服务完整性、可用性与保密性的行为。</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">五、处置等级</h2>
          <p>我们可能根据情节采取下列一项或多项措施，并保留依法向主管部门报告的权利：</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>删除/屏蔽：</strong>移除特定内容或禁止其继续展示；
            </li>
            <li>
              <strong>限制功能：</strong>临时限制发言、限制对话回合、限制存档同步等；
            </li>
            <li>
              <strong>暂停账号：</strong>在一定期限内中止登录或使用；
            </li>
            <li>
              <strong>终止服务：</strong>永久拒绝向特定账号提供本服务，并依法留存必要记录。
            </li>
          </ul>
          <p>
            在发现违规输入或违规输出传播风险时，我们可能还会采取“安全改写/回退呈现”的方式在尽量保留体验的同时降低风险；严重违规或恶意滥用将可能导致更严格的处置。
            具体措施与处置等级以我们核查结果与适用法律为准，并遵循必要的最小留痕原则。
          </p>
          <p className="text-xs text-slate-500">
            上述措施不构成对任何刑事、行政或民事责任的豁免或替代；我们在适用法律范围内配合有权机关调查。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">六、举报入口</h2>
          <p>
            发现违法违规或可疑内容时，请通过「联系我们」选择「举报投诉」并使用<strong>在线提交</strong>，尽量提供：发生时间（时区）、相关页面或对话片段、账号或会话标识、截图或其他可定位信息。
            成功提交后您将获得<strong>受理参考号</strong>（<code className="text-xs">VC-COMP-</code> 前缀），便于跟进与留痕。
            {contactLine}
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">七、申诉路径</h2>
          <p>
            若您认为处置错误或存在程序瑕疵，可在收到通知后（或您合理知悉后）通过「联系我们」选择「申诉」，说明账号、时间线、理由与证据。
            我们将在合理期限内复核并给予答复；<strong className="font-medium text-slate-800">复核结论为商业判断与合规判断的结合，不保证符合您的预期</strong>。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">八、证据保留与核查说明</h2>
          <p>
            为履行法定义务、应对争议与改进风控，我们可能在法律允许范围内保留与违规嫌疑相关的日志、文本片段、技术标识与处置记录。
            该等数据用于内部分析、审计与监管配合；保留期限遵循《隐私政策》及内部数据留存制度。
          </p>
          <p>
            在核查过程中，我们可能要求您补充材料或进行身份核验；对明显恶意或虚假的举报，我们保留限制举报权限或追究法律责任的权利（在适用法律允许范围内）。
          </p>
        </section>
      </article>
    </LegalDocShell>
  );
}
