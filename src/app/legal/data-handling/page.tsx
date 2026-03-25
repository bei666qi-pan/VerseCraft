import { LegalDocShell } from "@/components/legal/LegalDocShell";
import { getPublicRuntimeConfig } from "@/lib/config/publicRuntime";

export const metadata = {
  title: "数据处理与权利请求范围 - VerseCraft versecraft.cn",
  description: "VerseCraft 本地与云端数据位置、删除/导出边界及与产品实现一致的说明。",
};

export default function DataHandlingPage() {
  const cfg = getPublicRuntimeConfig();
  const c = cfg.compliance;

  return (
    <LegalDocShell title="数据处理与权利请求范围说明">
      <article className="space-y-6 text-sm leading-relaxed text-slate-700">
        <p className="text-slate-600">
          本页说明 VerseCraft（{c.officialDomain}）在当前产品形态下，个人与玩法数据<strong>主要存放位置</strong>、您可自主控制的部分，以及须通过
          <a className="mx-1 text-slate-900 underline underline-offset-2" href="/legal/contact">
            联系我们/数据权利请求
          </a>
          由我们人工核验处理的部分。
          <strong className="font-medium text-slate-800">
            {" "}
            若本页与《隐私政策》冲突，以《隐私政策》为准；具体可否删除/导出仍以适用法律、技术可行性与安全义务为准。
          </strong>
        </p>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">一、数据主要存放在哪里</h2>
          <p className="font-medium text-slate-800">1.1 终端本地（浏览器）</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>游戏进度、库存、任务、部分设置等可能保存在浏览器本地存储（如 IndexedDB），用于离线可用与减少请求；</li>
            <li>清除站点数据可导致本地进度丢失；若未同步至登录账号云端，可能无法恢复。</li>
          </ul>
          <p className="font-medium text-slate-800">1.2 服务端（需登录）</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>云存档：</strong>登录后触发同步的存档槽位数据（JSON 形态，含玩法状态、任务、图鉴等）存储于数据库{' '}
              <code className="rounded bg-slate-100 px-1 text-xs">save_slots</code>；
            </li>
            <li>
              <strong>会话记忆（如启用）：</strong>与剧情压缩相关的摘要可能存储于 <code className="rounded bg-slate-100 px-1 text-xs">game_session_memory</code>；
            </li>
            <li>
              <strong>合规与反馈留痕：</strong>您通过「联系我们」在线表单提交的受理记录存储于{" "}
              <code className="rounded bg-slate-100 px-1 text-xs">compliance_inquiries</code>；历史意见反馈可能存储于{" "}
              <code className="rounded bg-slate-100 px-1 text-xs">feedbacks</code>；
            </li>
            <li>
              <strong>安全与产品分析：</strong>匿名化或聚合前的原始事件可能进入 <code className="rounded bg-slate-100 px-1 text-xs">analytics_events</code>{" "}
              等表，用于统计与风控（字段以实际部署为准）。
            </li>
          </ul>
          <p className="text-xs text-slate-500">
            我们<strong>不会</strong>在本页或对外接口中批量暴露其他用户的存档正文或管理员密钥；前端仅应展示当前登录用户自身数据。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">二、您可自主完成的操作</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>在客户端内清除本地存储或浏览器站点数据（自担丢失风险）；</li>
            <li>在游戏内使用已有能力管理进度（以实际 UI 为准，如新游戏、槽位覆盖等）。</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">三、须由我们人工处理的路径</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>云端存档删除或导出副本：</strong>当前<strong>无</strong>全自助「一键导出 JSON / 一键删除云存档」中心；请通过在线表单选择「数据权利请求」并说明范围，我们在身份核验后处理；
            </li>
            <li>
              <strong>更正：</strong>账号显示名等若产品内不可改，可通过同一入口说明更正诉求；
            </li>
            <li>
              <strong>账号注销：</strong>当前<strong>无</strong>产品内自助注销按钮；注销与关联数据删除须通过数据权利请求或注册邮箱发起，我们在核验后于后台删除或匿名化（依法须保留的除外）。
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">四、依法或安全原因可能保留的数据</h2>
          <p>
            即使您申请删除，我们仍可能在适用法律要求的期限内，保留与安全、审计、争议解决、监管报送相关的最小必要信息（例如脱敏后的日志摘要、受理单记录）。
            该等保留不意味着我们继续将您的数据用于营销或与原目的不相符的处理。
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-900">五、与法律文档的对应关系</h2>
          <p>
            《隐私政策》中的权利行使途径包括本站的{" "}
            <a className="text-slate-900 underline underline-offset-2" href="/legal/contact">
              联系我们
            </a>{" "}
            在线提交（生成 <code className="text-xs">VC-COMP-</code> 参考号）。我们<strong>不宣称</strong>已提供全自动导出中心或完整工单流转后台；处理以人工与数据库留痕为主。
          </p>
        </section>
      </article>
    </LegalDocShell>
  );
}
