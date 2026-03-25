import { LegalDocShell } from "@/components/legal/LegalDocShell";
import { getPublicRuntimeConfig } from "@/lib/config/publicRuntime";

export const metadata = {
  title: "法律中心 - VerseCraft versecraft.cn",
  description: "VerseCraft 用户协议、隐私政策、内容规范、AI 说明与联系入口（versecraft.cn）。",
};

export default function LegalIndexPage() {
  const cfg = getPublicRuntimeConfig();
  const c = cfg.compliance;

  return (
    <LegalDocShell title="法律中心">
      <div className="space-y-5 text-slate-700">
        <p className="text-sm leading-relaxed text-slate-600">
          以下为 VerseCraft（{c.officialDomain}）公示的法律与合规文件入口，适用于公测及后续正式运营阶段（以产品公告为准）。
          文件之间互为补充；若条款存在不一致，以专门领域文件（如《隐私政策》之于个人信息）及更新日期较新者为准，
          <strong className="font-medium text-slate-800"> 最终以实际运营、适用法律与监管要求为准</strong>。
        </p>

        <ul className="space-y-2.5 text-sm">
          <li>
            <a className="font-medium text-slate-900 underline underline-offset-4" href="/legal/user-agreement">
              用户协议
            </a>
            <span className="text-slate-500"> — 服务范围、账号义务、知识产权、责任边界与争议解决</span>
          </li>
          <li>
            <a className="font-medium text-slate-900 underline underline-offset-4" href="/legal/privacy-policy">
              隐私政策
            </a>
            <span className="text-slate-500"> — 个人信息处理、云存档与 AI 传输、第三方与权利请求</span>
          </li>
          <li>
            <a className="font-medium text-slate-900 underline underline-offset-4" href="/legal/content-policy">
              内容规范与社区规则
            </a>
            <span className="text-slate-500"> — 违规分类、处置等级、举报与证据留存</span>
          </li>
          <li>
            <a className="font-medium text-slate-900 underline underline-offset-4" href="/legal/ai-disclaimer">
              AI 生成说明
            </a>
            <span className="text-slate-500"> — 模型局限、安全措施、辅助审核披露与纠错</span>
          </li>
          <li>
            <a className="font-medium text-slate-900 underline underline-offset-4" href="/legal/minors">
              未成年人说明
            </a>
            <span className="text-slate-500"> — 监护指引、气质提示、实名与防沉迷当前边界</span>
          </li>
          <li>
            <a className="font-medium text-slate-900 underline underline-offset-4" href="/legal/contact">
              联系我们 / 投诉举报 / 数据请求
            </a>
            <span className="text-slate-500"> — 服务端受理留痕（VC-COMP- 参考号）与可选邮件副本</span>
          </li>
          <li>
            <a className="font-medium text-slate-900 underline underline-offset-4" href="/legal/data-handling">
              数据处理与权利请求范围
            </a>
            <span className="text-slate-500"> — 本地/云端数据位置与删除、导出、注销的产品边界</span>
          </li>
        </ul>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          <p className="font-medium text-slate-800">备案与域名</p>
          <p className="mt-1">
            网站：{" "}
            <a className="underline underline-offset-2" href={c.officialSiteUrl} target="_blank" rel="noreferrer">
              {c.officialSiteUrl}
            </a>
          </p>
          <p>
            ICP：{" "}
            <a className="underline underline-offset-2" href={c.beianUrl} target="_blank" rel="noreferrer">
              {c.beianNumber}
            </a>
          </p>
          <p>
            联系电话：{" "}
            <a className="underline underline-offset-2" href={`tel:${c.contactPhone}`}>
              {c.contactPhone}
            </a>
          </p>
        </div>
      </div>
    </LegalDocShell>
  );
}
