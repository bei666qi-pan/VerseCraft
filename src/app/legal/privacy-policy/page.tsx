import { LegalDocShell } from "@/components/legal/LegalDocShell";
import { getPublicRuntimeConfig } from "@/lib/config/publicRuntime";

export const metadata = {
  title: "隐私政策 - 文界工坊 VerseCraft",
  description: "隐私政策（公测期基础合规）。",
};

export default function PrivacyPolicyPage() {
  const cfg = getPublicRuntimeConfig();
  const c = cfg.compliance;
  const contactEmail = c.contactEmail;
  const contactLine = contactEmail ? `联系邮箱：${contactEmail}` : "联系方式请以联系我们页面为准。";

  return (
    <LegalDocShell title="隐私政策">
      <div className="space-y-6 text-sm text-slate-700">
        <h2 className="text-base font-semibold text-slate-900">一、我们收集哪些信息</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>账号信息（如你主动注册/登录时提供的笔名等）；</li>
          <li>设备与日志信息（例如访问时间、请求来源、设备标识、错误信息等，用于保障服务安全与运行）；</li>
          <li>交互记录与内容（例如你在聊天、反馈、问卷等交互中输入或提交的文本内容）；</li>
          <li>联系方式（仅在你主动填写或通过联系我们方式提供时收集，例如用于测试联络或问题处理）。</li>
        </ul>

        <h2 className="text-base font-semibold text-slate-900">二、收集目的</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>提供服务与保障可用性；</li>
          <li>安全保障（包括风控、反滥用与必要的错误排查）；</li>
          <li>产品优化（包括基于交互数据的体验改进与测试评估）；</li>
          <li>测试联络与问题处理（仅在你主动提供联系方式时）。</li>
        </ul>

        <h2 className="text-base font-semibold text-slate-900">三、信息使用方式</h2>
        <p>
          我们会在必要范围内对信息进行处理，包括用于展示你的账号状态、提供交互能力、进行必要的安全检查与数据统计。
          除非法律法规另有要求，我们只会为上述目的进行合理使用。
        </p>

        <h2 className="text-base font-semibold text-slate-900">四、信息存储期限与删除方式</h2>
        <p>
          我们仅在实现上述收集目的所必需的期限内保存信息。你可以通过联系我们提出删除或更正请求。我们将根据法律法规与技术可行性进行处理。
          对于测试期数据，我们可能在合理时间后进行清理或归档。
        </p>

        <h2 className="text-base font-semibold text-slate-900">五、第三方服务与模型接口说明</h2>
        <p className="text-slate-600">
          本产品可能会接入第三方基础服务与 AI 模型服务，以提供生成与分析能力。具体第三方与调用方式可能随版本调整。
          你可以在本页面后续版本中查阅更新说明（此处保留占位，便于公测后填写真实内容）。
        </p>

        <h2 className="text-base font-semibold text-slate-900">六、Cookie 或本地存储说明</h2>
        <p>
          为提升体验，本网站可能会使用 Cookie 或浏览器本地存储保存游戏进度、设置与必要的缓存信息。你可以通过浏览器设置限制或清除相关数据。
          但请注意，清除数据可能影响部分功能的可用性。
        </p>

        <h2 className="text-base font-semibold text-slate-900">七、用户权利</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>查询：了解我们是否处理你的信息；</li>
          <li>更正：对不准确的信息提出更正；</li>
          <li>删除：在符合适用法律与技术可行性前提下申请删除；</li>
          <li>注销：在适用情况下申请停止服务并处理相关数据；</li>
          <li>撤回同意：对我们基于你的同意处理的内容，你可以撤回同意。</li>
        </ul>

        <h2 className="text-base font-semibold text-slate-900">八、未成年人个人信息说明</h2>
        <p>
          若你为未成年人，请在监护人指导下使用本服务。若你发现自己提供或处理未成年人个人信息存在问题，可通过联系我们提交更正或处理请求。
        </p>

        <h2 className="text-base font-semibold text-slate-900">九、联系我们</h2>
        <p className="text-slate-600">{contactLine}</p>
        <p className="text-slate-500">
          我们将尽合理努力在可行范围内处理你的请求与疑问。具体响应时间请见「联系我们」页面。
        </p>

        <h2 className="text-base font-semibold text-slate-900">十、政策更新</h2>
        <p>
          我们可能不时更新本隐私政策。更新后的内容将以页面展示为准，并标注相应生效日期。你继续使用服务即表示你同意更新后的政策。
        </p>
      </div>
    </LegalDocShell>
  );
}

