import { LegalDocShell } from "@/components/legal/LegalDocShell";
import { getPublicRuntimeConfig } from "@/lib/config/publicRuntime";

export const metadata = {
  title: "隐私政策 - VerseCraft versecraft.cn",
  description: "VerseCraft（versecraft.cn）个人信息保护政策（公测/正式版）。",
};

export default function PrivacyPolicyPage() {
  const cfg = getPublicRuntimeConfig();
  const c = cfg.compliance;
  const contactEmail = c.contactEmail;
  const contactBlock =
    contactEmail !== null
      ? `首选联系邮箱：${contactEmail}。`
      : `请通过「联系我们」页面提交数据权利请求，并注明「隐私/个人信息」主题。`;

  return (
    <LegalDocShell title="隐私政策">
      <article className="space-y-6 text-sm leading-relaxed text-slate-700">
        <p className="text-slate-600">
          本产品运营方（以下简称「我们」）重视您的个人信息保护。本政策说明我们如何收集、使用、存储、共享与保护在您使用 VerseCraft（域名 {c.officialDomain}）及相关服务过程中的个人信息。
          <strong className="font-medium text-slate-800">
            {" "}
            本政策不构成正式法律意见；具体处理活动合法性、您的权利行使方式及争议解决，以实际运营、适用法律、监管要求及必要时专业法律意见为准。
          </strong>
        </p>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">一、我们收集的信息类别</h2>
          <p className="font-medium text-slate-800">1.1 账号与身份相关信息</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>您在注册、登录或绑定第三方账号时产生或授权同步的标识信息（例如账户 ID、会话标识、昵称或显示名等，具体字段以实际产品为准）；</li>
            <li>为履行安全与反滥用义务而处理的设备或网络环境相关信息（例如 User-Agent、IP 地址、请求时间戳等，用于限流、风控与审计）。</li>
          </ul>
          <p className="font-medium text-slate-800">1.2 游戏与交互内容</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>游戏进度、角色与任务状态、库存与设置等玩法数据；</li>
            <li>您在与 AI 或剧情系统交互时输入的文本、选项及由此产生的对话与剧情记录（可能包含您主动键入的任意文字）；</li>
            <li>您通过「联系我们」等渠道自愿提交的联系方式与留言内容。</li>
          </ul>
          <p className="font-medium text-slate-800">1.3 日志、遥测与错误信息</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>服务端与客户端在运行中产生的访问日志、错误日志、性能与稳定性相关事件；</li>
            <li>为产品与运营分析之目的，以事件形式记录的统计信息（例如功能使用、会话时长区间、与对话回合相关的聚合指标等），在可行范围内进行脱敏或聚合处理；</li>
            <li>安全与合规相关记录（例如异常请求、命中内容安全策略的事件摘要等），用于风控、溯源与监管配合。</li>
          </ul>
          <p className="font-medium text-slate-800">1.4 本地与浏览器侧存储</p>
          <p>
            为支持离线进度、减少重复登录与提升体验，我们可能使用浏览器本地存储（如 IndexedDB、LocalStorage 等）保存游戏状态、偏好设置与缓存。
            此类数据主要保留在您的设备上，除非您主动同步至服务器或法律另有要求。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">二、使用目的</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>订立与履行与您之间的服务合同，提供、维护与改进本产品功能；</li>
            <li>实现云存档、跨设备同步与数据恢复（在您使用相关功能时）；</li>
            <li>保障网络与系统安全，防范欺诈、滥用、攻击与违法违规内容传播；</li>
            <li>履行法律法规规定的义务，配合监管、司法或执法机关的合法请求；</li>
            <li>在获得同意或符合法律规定的其他合法性基础下，进行产品分析与质量改进。</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">三、云存档、日志、遥测与 AI 交互的处理范围</h2>
          <p>
            <strong className="font-medium text-slate-800">3.1 云存档：</strong>
            当您使用账号并触发保存或同步时，您的存档数据可能加密或封装后经网络传输并存储于我们控制或委托的服务器与数据库中。
            存档内容可能包含玩法状态及与剧情/对话相关的文本，其体量与结构随产品演进可能变化。
          </p>
          <p>
            <strong className="font-medium text-slate-800">3.2 交互日志与遥测：</strong>
            为排查故障、统计用量、改进体验与安全审计，我们可能记录与单次请求或会话关联的技术与业务事件。
            部分事件可与您的账户关联；我们将在实现处理目的所必需的期限内保留，超出期限的将在可行时删除、匿名化或归档。
          </p>
          <p>
            <strong className="font-medium text-slate-800">3.3 AI 处理：</strong>
            为实现叙事生成、意图解析、内容安全与风控，您输入的内容及必要的上文语境可能被传送至我们接入的模型服务提供方进行处理。
            具体路由、模型提供方与地域可能随基础设施与合规评估调整；我们采取合同与技术与组织措施约束受托方，但
            <strong className="font-medium text-slate-800"> 无法保证第三方在每一时点的处理细节完全不变</strong>。
            详见下文「第三方与 AI 服务披露」。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">四、本地存储与浏览器存储</h2>
          <p>
            您可通过浏览器或系统设置清除站点数据；清除后可能导致本地进度丢失，若未同步至云端则可能无法恢复。
            我们建议您在进行清除操作前确认云存档状态或自行备份重要信息。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">五、第三方基础设施与 AI 服务披露</h2>
          <p>
            本产品依赖典型的云服务与数据库、缓存、对象存储等基础设施以提供在线能力；具体供应商与部署区域可能随版本与部署架构调整。
            为提供 AI 能力，我们会将必要文本发送至与 OpenAI 接口兼容的网关及网关后端的模型服务（可能包括境内或境外模型提供方，取决于您部署环境配置）。
          </p>
          <p>
            <strong className="font-medium text-slate-800">
              我们不在本政策中罗列每一时点、每一环境的所有第三方名称与合同编号，以免与您的实际部署不一致导致误导。
            </strong>
            若您需要了解特定企业部署下的子处理者清单，请通过「联系我们」提交书面询问，我们将在核实您的身份与权限后，在合理范围内答复。
          </p>
          <p>
            当我们委托第三方处理个人信息时，将依法通过协议等方式要求其采取安全措施并仅在委托范围内处理；若第三方独立决定处理目的与方式，则其作为独立个人信息处理者向您负责，我们以产品内说明或跳转提示等方式告知您。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">六、保存期限原则</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>账号与交易类信息：在账号存续期间及法律要求的最短保存期限届满前保留；</li>
            <li>日志与安全审计信息：通常按安全与合规需要的合理期限保留，届满后删除或匿名化；</li>
            <li>已注销账号：在法定期限届满后删除或匿名化处理，除非为履行法定义务必须继续保留。</li>
          </ul>
          <p>具体期限可能因功能迭代而调整，调整后将反映在本政策更新说明中。</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">七、您的权利：查询、更正、删除、导出与注销</h2>
          <p>
            在适用法律允许的范围内，您可对我们处理的您的个人信息行使查询、复制、更正、补充、删除等权利，并可撤回此前基于同意作出的授权（不影响撤回前基于授权已进行的处理活动的效力）。
          </p>
          <p>
            <strong className="font-medium text-slate-800">在线受理（推荐）：</strong>
            请前往{" "}
            <a className="text-slate-900 underline underline-offset-2" href="/legal/contact">
              联系我们
            </a>{" "}
            ，使用「在线提交」选择相应主题（含数据权利请求、申诉等）。提交成功后系统将生成<strong>受理参考号</strong>（形如{" "}
            <code className="text-xs">VC-COMP-编号</code>），并写入服务端数据库用于留痕与后续处理。
            <strong className="font-medium text-slate-800">
              {" "}
              当前阶段无完整工单流转后台，处理以人工核查为主，参考号便于您与我们就同一事项沟通。
            </strong>
          </p>
          <p>
            <strong className="font-medium text-slate-800">邮件或其他渠道：</strong>
            {contactBlock} 请在正文中说明请求类型、账号标识与验证方式。邮件本身不自动等同于系统受理单，我们可能要求您补充在线提交或身份信息以便留痕。
          </p>
          <p>
            <strong className="font-medium text-slate-800">数据范围与可实现边界：</strong>
            本地与云端数据位置、删除/导出/注销的<strong>产品侧边界</strong>以{" "}
            <a className="text-slate-900 underline underline-offset-2" href="/legal/data-handling">
              《数据处理与权利请求范围说明》
            </a>{" "}
            为准；其中如实说明：当前<strong>无</strong>全自助数据导出中心与<strong>无</strong>产品内一键注销按钮，相关请求需在身份核验后由我们操作。
          </p>
          <p>
            <strong className="font-medium text-slate-800">导出：</strong>
            若法律赋予数据可携带权且技术上可行，我们将在合理范围内提供结构化、通用格式的副本；导出范围以实际存储的数据为准，不包含依法不得提供的内容。
            <strong className="font-medium text-slate-800"> 我们不承诺即时、全自动打包全量历史日志。</strong>
          </p>
          <p>
            <strong className="font-medium text-slate-800">账号注销：</strong>
            若产品内未提供自助注销入口，您应通过上述「数据权利请求」或注册时使用的联系渠道提出申请；我们在核验身份后删除或匿名化账号及关联数据，依法必须保留的最小范围除外。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">八、未成年人个人信息</h2>
          <p>
            若您为未成年人，请在监护人指导下阅读本政策并使用本服务。监护人有权联系我们访问、更正或删除未成年人相关信息（在适用法律允许的范围内）。
            关于本产品是否实施实名认证、游戏时长限制等机制，以《未成年人说明》及实际产品功能为准；
            <strong className="font-medium text-slate-800"> 我们不在未核实的情况下声称已提供超出实际能力的保护措施</strong>。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">九、安全措施与必要留痕</h2>
          <p>
            我们采取符合业界实践的技术与管理措施（如访问控制、传输与存储加密（在适用场景）、权限分级、安全审计、员工保密义务等）保护个人信息。
            <strong className="font-medium text-slate-800"> 没有任何系统能保证绝对安全</strong>；
            一旦发生或可能发生个人信息安全事件，我们将依法启动应急预案、告知您并向主管机关报告（如适用）。
          </p>
          <p>为应对滥用、攻击与法律争议，我们可能在法律允许范围内保留必要的交互与安全留痕，该等留痕本身亦可能构成个人信息或关联信息。</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">十、联系方式与响应</h2>
          <p>{contactBlock}</p>
          <p>
            {c.customerWechat ? `客服微信：${c.customerWechat}。` : null}
            {c.customerPublicAccount ? `客服公众号：${c.customerPublicAccount}。` : null}
          </p>
          <p className="text-xs text-slate-500">
            我们力争在十五（15）个工作日内或法律法规要求的期限内首次答复您的请求；复杂案件可能延长，我们将告知进展。
            该等时限为目标性承诺，不排除因不可抗力、争议协调或监管程序而合理延迟。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">十一、政策更新</h2>
          <p>
            我们可能不时更新本政策。更新后的版本将在本产品内发布并注明生效日期；若变更涉及处理目的、方式或权利行使的重大变化，我们将以显著方式提示。
            您继续使用本服务即表示您已阅读并理解更新后的政策；若您不同意，请停止使用并联系我们处理您的账号与数据（在适用范围内）。
          </p>
        </section>
      </article>
    </LegalDocShell>
  );
}
