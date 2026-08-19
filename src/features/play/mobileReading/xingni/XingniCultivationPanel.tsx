"use client";

import {
  getQingshiNeighbors,
  isQingshiLocationId,
  QINGSHI_LOCATIONS,
  QINGSHI_MAP_EXIT,
  QINGSHI_NPCS,
  type QingshiLocationId,
} from "@/lib/worlds/xingni/qingshiContent";
import type { XingniTaichuState } from "@/lib/worlds/xingni/progression";
import { getCurrentQingshiObjective, getQingshiRecoverySteps } from "@/lib/worlds/xingni/progression";
import { QINGSHI_NPC_PROFILES, getNpcLocationAt } from "@/lib/worlds/xingni/qingshiProductionContent";

type Props = {
  currentLocation: string;
  state: XingniTaichuState;
  busy?: boolean;
  onAction: (text: string) => void;
};

const SERVICE_ACTIONS: Partial<Record<QingshiLocationId, readonly { label: string; action: string }[]>> = {
  QS_GUOYAN_INN: [
    { label: "向柳三娘打听消息", action: "向归雁客栈掌柜柳三娘打听青石县近来的公开消息。" },
    { label: "休整气海", action: "在归雁客栈安静休整，检查受损气海与随身资源。" },
    { label: "治疗伤势", action: "在归雁客栈按登记费用治疗当前伤势。" },
    { label: "申请客栈杂役", action: "在归雁客栈申请不要求前置支付的救济杂役。" },
  ],
  QS_CULTIVATOR_MARKET: [
    { label: "购买入门灵材包", action: "在散修坊市用两枚灵石购买登记的入门灵材包。" },
  ],
  QS_HERB_HALL: [
    { label: "炼制聚气散", action: "在百草堂使用登记丹炉，以灵叶和阳籽炼制一份聚气散。" },
  ],
  QS_DIVINE_FORGE: [
    { label: "修复残损法器", action: "在神工坊使用玄铁和三枚灵石修复残损法器。" },
  ],
  QS_EXORCISM_OFFICE: [
    { label: "查看镇邪司委托", action: "在县衙镇邪司查看黑松岭登记妖兽与当前公开委托。" },
  ],
  QS_ASCENSION_TERRACE: [
    { label: "挑战升仙试阵傀", action: "在升仙台向许闻舟申请挑战登记的升仙试阵傀。" },
  ],
  QS_BLACK_PINE_RIDGE: [
    { label: "采集登记灵材", action: "在黑松岭登记采集点采集灵叶、阳籽与玄铁。" },
    { label: "挑战铁背獠猪", action: "在黑松岭挑战登记妖兽铁背獠猪，争取战斗凭证。" },
  ],
  QS_SPIRIT_SPRING_CAVE: [
    { label: "吐纳修炼", action: "在灵泉洞按基础吐纳法修炼，尝试恢复受损气海与修为。" },
  ],
};

const CREDENTIAL_LABELS = { combat: "战斗", alchemy: "炼丹", refining: "炼器" } as const;

export function XingniCultivationPanel({ currentLocation, state, busy = false, onAction }: Props) {
  const safeLocation: QingshiLocationId = isQingshiLocationId(currentLocation)
    ? currentLocation
    : "QS_GUOYAN_INN";
  const location = QINGSHI_LOCATIONS[safeLocation];
  const neighbors = getQingshiNeighbors(safeLocation);
  const actions = SERVICE_ACTIONS[safeLocation] ?? [];
  const exitUnlocked = state.unlockedMapIds.includes(QINGSHI_MAP_EXIT.toMapId);
  const objective = getCurrentQingshiObjective(state);
  const recoverySteps = getQingshiRecoverySteps(state);
  const presentNpcs = QINGSHI_NPCS.filter((npc) => getNpcLocationAt(npc.id, state.clock.hour) === safeLocation);
  const injuryLabel = state.vitality.injury === "severe" ? "重伤" : state.vitality.injury === "light" ? "轻伤" : "无伤";
  const unavailableService = safeLocation === "QS_HERB_HALL"
    ? !presentNpcs.some((npc) => npc.id === "XQ-N002")
    : safeLocation === "QS_DIVINE_FORGE"
      ? !presentNpcs.some((npc) => npc.id === "XQ-N003")
      : safeLocation === "QS_ASCENSION_TERRACE"
        ? !presentNpcs.some((npc) => npc.id === "XQ-N004")
        : false;

  return (
    <section
      data-testid="xingni-cultivation-panel"
      className="box-border flex h-full min-h-0 flex-col overflow-y-auto bg-vc-paper px-5 pb-[calc(var(--vc-mobile-bottom-nav-height)+1rem+env(safe-area-inset-bottom))] pt-[max(0.9rem,env(safe-area-inset-top))] text-vc-ink"
      aria-label="星逆角色与青石县地图"
    >
      <div className="mx-auto w-full max-w-[430px] space-y-4">
        <header className="rounded-2xl border border-vc-line bg-vc-paper-bright px-5 py-4 vc-shadow-card">
          <p className="text-[12px] font-semibold tracking-[.28em] text-vc-ink-faint">星逆 · 太初</p>
          <div className="mt-2 flex items-end justify-between gap-3">
            <div>
              <h2 className="vc-reading-serif text-[28px] font-semibold" data-testid="xingni-realm">{state.cultivation.realm}</h2>
              <p className="mt-1 text-[14px] text-vc-ink-soft">{state.spiritRoot}灵根 · {state.cultivation.qiSeaDamaged ? "气海受损" : "气海已复"}</p>
            </div>
            <div className="rounded-full border border-vc-line bg-vc-paper-raised px-3 py-1.5 vc-reading-serif text-[15px]" data-testid="xingni-spirit-stones">
              灵石 {state.spiritStones}
            </div>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-vc-line" aria-label={`修炼进度 ${state.cultivation.progress}%`}>
            <div className="h-full rounded-full bg-vc-accent transition-[width]" style={{ width: `${state.cultivation.progress}%` }} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-[13px]">
            {(["combat", "alchemy", "refining"] as const).map((credential) => (
              <span
                key={credential}
                className={state.credentials.includes(credential) ? "rounded-full bg-vc-accent px-3 py-1 text-white" : "rounded-full border border-vc-line px-3 py-1 text-vc-ink-faint"}
              >
                {CREDENTIAL_LABELS[credential]}凭证 {state.credentials.includes(credential) ? "✓" : "○"}
              </span>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[12px]" data-testid="xingni-vitality-summary">
            <div className="rounded-xl bg-vc-paper-raised px-2 py-2"><span className="block text-vc-ink-faint">体魄</span><strong>{state.vitality.health}/{state.vitality.maxHealth}</strong></div>
            <div className="rounded-xl bg-vc-paper-raised px-2 py-2"><span className="block text-vc-ink-faint">体力</span><strong>{state.vitality.stamina}/{state.vitality.maxStamina}</strong></div>
            <div className="rounded-xl bg-vc-paper-raised px-2 py-2"><span className="block text-vc-ink-faint">伤势</span><strong className={state.vitality.injury === "severe" ? "text-vc-seal" : ""}>{injuryLabel}</strong></div>
          </div>
        </header>

        <section className="rounded-2xl border border-vc-line-warm bg-vc-paper-bright px-5 py-4" data-testid="xingni-current-objective">
          <div className="flex items-center justify-between gap-3"><p className="text-[12px] font-semibold tracking-[.22em] text-vc-ink-faint">当前主线</p><span className="text-[12px] text-vc-ink-soft">第 {state.clock.day} 日 · {state.clock.slot}</span></div>
          <p className="mt-2 vc-reading-serif text-[18px] font-semibold leading-7">{objective}</p>
        </section>

        {recoverySteps.length > 0 ? (
          <section className="rounded-2xl border border-vc-seal/40 bg-vc-paper-bright px-5 py-4" data-testid="xingni-recovery-guide" role="status">
            <h3 className="vc-reading-serif text-[19px] font-semibold text-vc-seal">恢复路径已开放</h3>
            <p className="mt-1 text-[13px] leading-5 text-vc-ink-soft">本次损失：{state.recovery.lastLossStones} 灵石{state.recovery.lastLostMaterialId ? "及一组普通材料" : ""}。关键任务与凭证均保留。</p>
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-[13px] leading-5 text-vc-ink-soft">{recoverySteps.map((step) => <li key={step}>{step}</li>)}</ol>
          </section>
        ) : null}

        <section className="rounded-2xl border border-vc-line bg-vc-paper-bright px-5 py-4" data-testid="xingni-map-panel">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[12px] font-semibold tracking-[.22em] text-vc-ink-faint">青石县 · 当前地点</p>
              <h3 className="mt-1 vc-reading-serif text-[25px] font-semibold" data-testid="xingni-current-location">{location.name}</h3>
            </div>
            <span className="rounded-full bg-vc-paper-raised px-3 py-1 text-[12px]">每回合一条边</span>
          </div>
          <p className="mt-2 text-[14px] leading-6 text-vc-ink-soft">{location.description}</p>

          <div className="mt-4 rounded-xl bg-vc-paper-raised px-4 py-3" data-testid="xingni-present-npcs">
            <p className="text-[13px] font-semibold text-vc-ink-soft">当前在场</p>
            {presentNpcs.length ? <div className="mt-2 space-y-2">{presentNpcs.map((npc) => {
              const profile = QINGSHI_NPC_PROFILES[npc.id as keyof typeof QINGSHI_NPC_PROFILES];
              const serviceOpen = profile.serviceWindows.length === 0 || (profile.serviceWindows as readonly string[]).includes(state.clock.slot);
              return <div key={npc.id} className="flex items-center justify-between gap-3 text-[13px]"><span><strong>{npc.name}</strong> · {npc.role}</span><span className={serviceOpen ? "text-vc-ink-soft" : "text-vc-seal"}>{serviceOpen ? "可交互" : "服务暂停"}</span></div>;
            })}</div> : <p className="mt-1 text-[13px] text-vc-ink-faint">此时无人值守，可等待六个时辰查看下一时段。</p>}
            <button type="button" disabled={busy} onClick={() => onAction("按青石县登记时段等待六个时辰。") } className="mt-3 min-h-11 w-full rounded-xl border border-vc-line bg-vc-paper-bright px-3 text-[14px] font-semibold disabled:opacity-45">等待下一时段</button>
          </div>

          <div className="mt-4 border-t border-vc-line pt-4">
            <p className="text-[13px] font-semibold text-vc-ink-soft">相邻地点</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {neighbors.map((neighborId) => (
                <button
                  key={neighborId}
                  type="button"
                  disabled={busy}
                  onClick={() => onAction(`沿青石县登记道路前往${QINGSHI_LOCATIONS[neighborId].name}。`)}
                  data-testid={`xingni-move-${neighborId}`}
                  className="min-h-11 rounded-xl border border-vc-line bg-vc-paper-raised px-3 py-2 vc-reading-serif text-[16px] font-semibold transition enabled:hover:bg-white enabled:active:scale-[.98] disabled:opacity-45"
                >
                  前往{QINGSHI_LOCATIONS[neighborId].name}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-dashed border-vc-line-warm bg-vc-paper-raised px-4 py-3" data-testid="xingni-locked-exit">
            <div className="flex items-center justify-between gap-3">
              <span className="vc-reading-serif text-[17px] font-semibold">界门 · 青云渡</span>
              <span className="text-[12px] font-semibold text-vc-seal">{exitUnlocked ? "已解锁 · 尚未开放" : "升仙试后解锁"}</span>
            </div>
            <p className="mt-1 text-[13px] leading-5 text-vc-ink-soft">下一张确定性地图入口已登记，首版不会生成界门后的地点或人物。</p>
          </div>
        </section>

        {actions.length > 0 ? (
          <section className="rounded-2xl border border-vc-line bg-vc-paper-bright px-5 py-4" data-testid="xingni-context-actions">
            <h3 className="vc-reading-serif text-[21px] font-semibold">此地可做</h3>
            <div className="mt-3 space-y-2">
              {actions.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  disabled={busy || unavailableService}
                  onClick={() => onAction(item.action)}
                  className="flex min-h-11 w-full items-center justify-between rounded-xl border border-vc-line bg-vc-paper-raised px-4 py-2.5 text-left vc-reading-serif text-[16px] font-semibold transition enabled:hover:bg-white enabled:active:scale-[.99] disabled:opacity-45"
                >
                  <span>{item.label}</span><span aria-hidden>→</span>
                </button>
              ))}
            </div>
            {unavailableService ? <p className="mt-3 text-[13px] leading-5 text-vc-seal" role="status">登记服务当前无人值守。可使用上方“等待下一时段”，无需反复试探。</p> : null}
          </section>
        ) : null}
      </div>
    </section>
  );
}
