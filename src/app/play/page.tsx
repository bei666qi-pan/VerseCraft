"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Item, StatType } from "@/lib/registry/types";
import { useGameStore, type EchoTalent } from "@/store/useGameStore";

type ChatRole = "user" | "assistant";
type ChatMessage = { role: ChatRole; content: string };

type DMJson = {
  is_action_legal: boolean;
  sanity_damage: number;
  narrative: string;
  is_death: boolean;
};

const MAX_INPUT = 20;

const TALENT_CD: Record<EchoTalent, number> = {
  时间回溯: 6,
  命运馈赠: 3,
  主角光环: 6,
  生命汇源: 5,
  洞察之眼: 4,
  丧钟回响: 7,
};

const STAT_ORDER: StatType[] = ["sanity", "agility", "luck", "charm", "background"];
const STAT_LABELS: Record<StatType, string> = {
  sanity: "理智",
  agility: "敏捷",
  luck: "幸运",
  charm: "魅力",
  background: "出身",
};

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function safeNumber(n: unknown, fallback: number): number {
  const v = typeof n === "number" ? n : Number(n);
  return Number.isFinite(v) ? v : fallback;
}

function extractNarrativePartial(raw: string): string | null {
  const key = "\"narrative\"";
  const k = raw.indexOf(key);
  if (k === -1) return null;

  const colon = raw.indexOf(":", k + key.length);
  if (colon === -1) return null;

  // 找到 narrative 字符串的起始引号
  let i = colon + 1;
  while (i < raw.length && /\s/.test(raw[i] ?? "")) i += 1;
  if (raw[i] !== "\"") return null;
  i += 1;

  let out = "";
  while (i < raw.length) {
    const ch = raw[i]!;
    if (ch === "\\") {
      const next = raw[i + 1];
      if (next === undefined) break;
      if (next === "n") out += "\n";
      else if (next === "t") out += "\t";
      else if (next === "r") out += "\r";
      else if (next === "\"") out += "\"";
      else if (next === "\\") out += "\\";
      else out += next;
      i += 2;
      continue;
    }
    if (ch === "\"") return out;
    out += ch;
    i += 1;
  }

  return out;
}

const FALLBACK_DM: DMJson = {
  is_action_legal: true,
  sanity_damage: 0,
  narrative: "（系统波动）周围的空气似乎扭曲了一瞬，请继续你的行动...",
  is_death: false,
};

function tryParseDM(raw: string): DMJson | null {
  let cleanContent = raw
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    cleanContent = jsonMatch[0];
  }

  let parsedData: DMJson;
  try {
    parsedData = JSON.parse(cleanContent) as DMJson;
  } catch (e) {
    console.error("JSON Parsing Failed, raw content:", raw);
    return FALLBACK_DM;
  }

  if (
    typeof parsedData?.is_action_legal === "boolean" &&
    typeof parsedData?.sanity_damage === "number" &&
    typeof parsedData?.narrative === "string" &&
    typeof parsedData?.is_death === "boolean"
  ) {
    return parsedData;
  }
  return FALLBACK_DM;
}

function ensureRuntimeActions() {
  const storeAny = useGameStore as any;
  const s = storeAny.getState?.() ?? {};

  // 仅在缺失时注入，避免重复覆盖
  if (typeof s.decrementCooldowns !== "function") {
    storeAny.setState((prev: any) => ({
      ...prev,
      decrementCooldowns: () => {
        storeAny.setState((p: any) => {
          const prevCds = p.talentCooldowns ?? {};
          const nextCds: Record<string, number> = { ...prevCds };
          for (const k of Object.keys(nextCds)) {
            const v = safeNumber(nextCds[k], 0);
            nextCds[k] = v > 0 ? v - 1 : 0;
          }
          return {
            chapter: safeNumber(p.chapter, 1) + 1,
            talentCooldowns: nextCds,
          };
        });
      },
    }));
  }

  if (typeof s.useTalent !== "function") {
    storeAny.setState((prev: any) => ({
      ...prev,
      useTalent: (talent: EchoTalent) => {
        const cdNow = safeNumber(storeAny.getState().talentCooldowns?.[talent], 0);
        if (cdNow > 0) return false;
        const nextCd = TALENT_CD[talent] ?? 0;
        storeAny.setState((p: any) => ({
          talentCooldowns: { ...(p.talentCooldowns ?? {}), [talent]: nextCd },
        }));
        return true;
      },
    }));
  }
}

function formatItem(i: Item): string {
  return `${i.name}（${i.tier}）`;
}

export default function PlayPage() {
  const router = useRouter();

  const isHydrated = useGameStore((s) => s.isHydrated);
  const setHydrated = useGameStore((s) => s.setHydrated);

  const chapter = useGameStore((s) => s.chapter);
  const stats = useGameStore((s) => s.stats);
  const inventory = useGameStore((s) => s.inventory);
  const talent = useGameStore((s) => s.talent);
  const talentCooldowns = useGameStore((s) => s.talentCooldowns);
  const logs = useGameStore((s) => s.logs ?? []);
  const time = useGameStore((s) => s.time ?? { day: 0, hour: 0 });
  const advanceTime = useGameStore((s) => s.advanceTime);
  const setStats = useGameStore((s) => s.setStats);

  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [rawDmBuffer, setRawDmBuffer] = useState("");
  const [liveNarrative, setLiveNarrative] = useState("");
  const [showDarkMoonOverlay, setShowDarkMoonOverlay] = useState(false);
  const [showApocalypseOverlay, setShowApocalypseOverlay] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  const day = time.day ?? 0;
  const hour = time.hour ?? 0;
  const isDarkMoon = day >= 3 && day < 10;
  const isApocalypse = day >= 10;

  const sanity = stats.sanity ?? 0;

  const talentCdLeft = useMemo(() => {
    if (!talent) return 0;
    return safeNumber(talentCooldowns?.[talent], 0);
  }, [talent, talentCooldowns]);

  useEffect(() => {
    ensureRuntimeActions();
  }, []);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted) return;
    void Promise.resolve(useGameStore.persist.rehydrate()).then(() => {
      setHydrated(true);
    });
  }, [isMounted, setHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    const t = useGameStore.getState().time ?? { day: 0, hour: 0 };
    if (t.day >= 10 && !showApocalypseOverlay) {
      setShowApocalypseOverlay(true);
    }
  }, [isHydrated, showApocalypseOverlay]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [liveNarrative, isStreaming]);

  useEffect(() => {
    if (sanity <= 0) {
      setTimeout(() => router.push("/settlement"), 2000);
    }
  }, [sanity, router]);

  useEffect(() => {
    if (!showDarkMoonOverlay) return;
    const t = setTimeout(() => setShowDarkMoonOverlay(false), 3000);
    return () => clearTimeout(t);
  }, [showDarkMoonOverlay]);

  useEffect(() => {
    if (!showApocalypseOverlay) return;
    const t = setTimeout(() => {
      setStats({ sanity: 0 });
      router.push("/settlement");
    }, 3000);
    return () => clearTimeout(t);
  }, [showApocalypseOverlay, setStats, router]);

  async function sendAction(action: string) {
    if (isStreaming) return;
    const trimmed = action.trim();
    if (!trimmed) return;
    if (trimmed.length > MAX_INPUT) return;

    setIsStreaming(true);
    setRawDmBuffer("");
    setLiveNarrative("");

    messagesRef.current = [
      ...messagesRef.current,
      { role: "user", content: trimmed },
    ];
    useGameStore.getState().pushLog({ role: "user", content: trimmed });

    const history = useGameStore.getState().logs ?? [];
    const messages: ChatMessage[] = history.map((l) => ({
      role: l.role as ChatRole,
      content: l.content,
    }));

    const playerContext = useGameStore.getState().getPromptContext();

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages,
        playerContext,
      }),
    });

    if (!res.ok || !res.body) {
      setIsStreaming(false);
      setLiveNarrative(`连接失败：${res.status}`);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buf = "";
    let raw = "";

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        while (true) {
          const idx = buf.indexOf("\n\n");
          if (idx === -1) break;
          const event = buf.slice(0, idx);
          buf = buf.slice(idx + 2);

          const lines = event.split("\n");
          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const chunk = line.slice(5).trimStart();
            raw += chunk;
            setRawDmBuffer(raw);

            const partial = extractNarrativePartial(raw);
            if (partial !== null) setLiveNarrative(partial);
            else setLiveNarrative(raw);
          }
        }
      }
    } finally {
      try {
        await reader.cancel();
      } catch {
        // ignore
      }
    }

    const parsed = tryParseDM(raw);
    if (!parsed) {
      setIsStreaming(false);
      setLiveNarrative(
        "深渊 DM 输出解析失败。请尝试缩短动作描述，或稍后重试。"
      );
      return;
    }

    useGameStore.getState().pushLog({
      role: "assistant",
      content: parsed.narrative,
      reasoning: undefined,
    });

    setLiveNarrative("");

    const dmg = clampInt(parsed.sanity_damage ?? 0, 0, 9999);
    if (dmg > 0) {
      const cur = useGameStore.getState().stats.sanity ?? 0;
      useGameStore.getState().setStats({ sanity: Math.max(0, cur - dmg) });
    }

    if (parsed.is_action_legal && !parsed.is_death) {
      const storeAny = useGameStore as any;
      storeAny.getState().decrementCooldowns();
      const prevTime = useGameStore.getState().time ?? { day: 0, hour: 0 };
      advanceTime();
      const nextTime = useGameStore.getState().time ?? { day: 0, hour: 0 };
      if (prevTime.day < 3 && nextTime.day === 3 && nextTime.hour === 0) {
        setShowDarkMoonOverlay(true);
      }
      if (nextTime.day >= 10) {
        setShowApocalypseOverlay(true);
      }
    }

    setIsStreaming(false);

    const sanityAfter = useGameStore.getState().stats.sanity ?? 0;

    if (parsed.is_death || sanityAfter <= 0) {
      setTimeout(() => router.push("/settlement"), 2000);
    }
  }

  function onSubmit() {
    void sendAction(input);
    setInput("");
  }

  function onUseTalent() {
    if (!talent) return;
    if (talentCdLeft > 0) return;
    const storeAny = useGameStore as any;
    const ok = storeAny.getState().useTalent(talent);
    if (!ok) return;
    void sendAction(`发动天赋：${talent}！`);
  }

  if (!isMounted || !isHydrated) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-48 animate-pulse rounded-lg bg-neutral-200" />
          <div className="h-4 w-32 animate-pulse rounded bg-neutral-100" />
          <p className="text-sm text-neutral-500">读取世界线中...</p>
        </div>
      </main>
    );
  }

  const displayMessages = logs.map((l) => ({ role: l.role as ChatRole, content: l.content }));

  return (
    <main
      className={`min-h-screen transition-all duration-1000 ${
        isDarkMoon
          ? "bg-gradient-to-b from-red-950/20 via-red-950/10 to-black text-red-100"
          : "bg-background text-foreground"
      }`}
    >
      {showDarkMoonOverlay && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black transition-opacity duration-700"
          aria-hidden
        >
          <p className="animate-pulse text-3xl font-bold tracking-widest text-red-600 md:text-5xl">
            暗月已至
          </p>
        </div>
      )}

      {showApocalypseOverlay && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black transition-opacity duration-1000"
          aria-hidden
        >
          <p className="animate-pulse text-center text-xl font-bold tracking-widest text-white md:text-3xl">
            十日已至，一切终焉。
          </p>
        </div>
      )}

      <div className="relative mx-auto w-full max-w-6xl px-6 py-8">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <h1
              className={`text-2xl font-semibold tracking-tight ${
                isDarkMoon ? "text-red-200" : ""
              }`}
            >
              意识潜入
            </h1>
            <p
              className={`text-sm ${
                isDarkMoon ? "text-red-300/90" : "text-neutral-600"
              }`}
            >
              章节：<span className="font-semibold">{chapter}</span>
              {" · "}
              理智：
              <span
                className={`ml-1 font-semibold ${
                  sanity <= 3 ? "text-red-400" : isDarkMoon ? "text-red-200" : "text-neutral-900"
                }`}
              >
                {sanity}
              </span>
            </p>
          </div>

          <button
            type="button"
            onClick={onUseTalent}
            disabled={!talent || talentCdLeft > 0 || isStreaming}
            className={`h-11 rounded-xl border px-5 text-sm font-semibold transition ${
              isDarkMoon
                ? "border-red-900/60 bg-red-950/50 text-red-300"
                : !talent
                  ? "border-border bg-white text-neutral-400"
                  : talentCdLeft > 0 || isStreaming
                    ? "border-border bg-white text-neutral-400"
                    : "border-accent bg-muted text-neutral-900 hover:bg-white"
            }`}
          >
            {talent ? (
              talentCdLeft > 0 ? (
                <>
                  回响天赋：{talent}（剩余 {talentCdLeft}）
                </>
              ) : (
                <>发动回响天赋：{talent}</>
              )
            ) : (
              <>未选择回响天赋</>
            )}
          </button>
        </header>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
          <aside className="lg:col-span-4">
            <div
              className={`mb-4 rounded-2xl border px-5 py-4 backdrop-blur-md ${
                isDarkMoon
                  ? "border-red-900/60 bg-red-950/30"
                  : "border-white/60 bg-white/80"
              }`}
            >
              <p className={`font-mono text-base font-semibold tabular-nums ${isDarkMoon ? "text-red-200" : "text-neutral-800"}`}>
                存活时间：{day} 日 {hour} 时
              </p>
            </div>

            <div
              className={`rounded-2xl border p-5 ${
                isDarkMoon
                  ? "border-red-900/50 bg-red-950/40 backdrop-blur-sm"
                  : "border-border bg-white"
              }`}
            >
              <h2 className={`text-sm font-semibold ${isDarkMoon ? "text-red-200" : ""}`}>属性</h2>
              <div className="mt-4 space-y-3">
                {STAT_ORDER.map((k) => {
                  const isSanityDanger = k === "sanity" && (stats[k] ?? 0) <= 3;
                  return (
                    <div
                      key={k}
                      className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
                        isSanityDanger
                          ? "animate-pulse border-red-500/50 bg-red-500/10 text-red-500"
                          : isDarkMoon
                            ? "border-red-900/40 bg-red-950/30"
                            : "border-border bg-muted"
                      }`}
                    >
                      <span
                        className={`text-sm ${
                          isSanityDanger ? "font-semibold text-red-500" : isDarkMoon ? "text-red-300/80" : "text-neutral-700"
                        }`}
                      >
                        {STAT_LABELS[k]}
                      </span>
                      <span
                        className={`font-mono text-sm font-semibold tabular-nums ${
                          isSanityDanger ? "text-red-500" : isDarkMoon ? "text-red-200" : "text-neutral-900"
                        }`}
                      >
                        {stats[k] ?? 0}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div
              className={`mt-6 rounded-2xl border p-5 ${
                isDarkMoon ? "border-red-900/50 bg-red-950/40" : "border-border bg-white"
              }`}
            >
              <h2 className={`text-sm font-semibold ${isDarkMoon ? "text-red-200" : ""}`}>物品栏</h2>
              <div className="mt-4 space-y-2">
                {inventory.length === 0 ? (
                  <div
                    className={`rounded-xl border px-4 py-3 text-sm ${
                      isDarkMoon ? "border-red-900/40 bg-red-950/30 text-red-300/80" : "border-border bg-muted text-neutral-600"
                    }`}
                  >
                    空
                  </div>
                ) : (
                  inventory.map((i) => (
                    <div
                      key={i.id}
                      className={`rounded-xl border px-4 py-3 ${
                        isDarkMoon ? "border-red-900/40 bg-red-950/30" : "border-border bg-muted"
                      }`}
                    >
                      <div className={`text-sm font-semibold ${isDarkMoon ? "text-red-200" : "text-neutral-900"}`}>
                        {formatItem(i)}
                      </div>
                      <div className={`mt-1 text-xs ${isDarkMoon ? "text-red-300/70" : "text-neutral-600"}`}>
                        {i.description}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </aside>

          <section className="lg:col-span-8">
            <div
              className={`rounded-2xl border ${
                isDarkMoon ? "border-red-900/50 bg-red-950/30" : "border-border bg-white"
              }`}
            >
              <div className={`border-b px-5 py-4 ${isDarkMoon ? "border-red-900/50" : "border-border"}`}>
                <h2 className={`text-sm font-semibold ${isDarkMoon ? "text-red-200" : ""}`}>叙事主视窗</h2>
                <p className={`mt-1 text-xs ${isDarkMoon ? "text-red-300/80" : "text-neutral-600"}`}>
                  输入必须简短。规则会记住每一次犹豫。
                </p>
              </div>

              <div
                ref={scrollRef}
                className="h-[54vh] overflow-auto px-5 py-5"
              >
                <div className="space-y-4">
                  {displayMessages.map((m, idx) => (
                    <div
                      key={`${m.role}-${idx}`}
                      className={`rounded-2xl border px-4 py-3 text-sm leading-7 ${
                        isDarkMoon
                          ? m.role === "user"
                            ? "border-red-900/40 bg-red-950/50 text-red-100"
                            : "border-red-900/40 bg-red-950/20 text-red-100"
                          : m.role === "user"
                            ? "border-border bg-muted text-neutral-900"
                            : "border-border bg-white text-neutral-900"
                      }`}
                    >
                      <div
                        className={`mb-1 text-xs font-semibold ${
                          isDarkMoon ? "text-red-300/90" : "text-neutral-600"
                        }`}
                      >
                        {m.role === "user" ? "你" : "DM"}
                      </div>
                      <div className="whitespace-pre-wrap">{m.content}</div>
                    </div>
                  ))}

                  {isStreaming ? (
                    <div
                      className={`rounded-2xl border px-4 py-3 text-sm leading-7 ${
                        isDarkMoon
                          ? "border-red-900/40 bg-red-950/20 text-red-100"
                          : "border-border bg-white text-neutral-900"
                      }`}
                    >
                      <div className={`mb-1 text-xs font-semibold ${isDarkMoon ? "text-red-300/90" : "text-neutral-600"}`}>
                        DM
                      </div>
                      <div className="whitespace-pre-wrap">{liveNarrative || "……"}</div>
                    </div>
                  ) : liveNarrative ? (
                    <div
                      className={`rounded-2xl border px-4 py-3 text-sm leading-7 ${
                        isDarkMoon
                          ? "border-red-900/40 bg-red-950/20 text-red-100"
                          : "border-border bg-white text-neutral-900"
                      }`}
                    >
                      <div className={`mb-1 text-xs font-semibold ${isDarkMoon ? "text-red-300/90" : "text-neutral-600"}`}>
                        DM
                      </div>
                      <div className="whitespace-pre-wrap">{liveNarrative}</div>
                    </div>
                  ) : (
                    <div
                      className={`rounded-2xl border px-4 py-3 text-sm ${
                        isDarkMoon
                          ? "border-red-900/40 bg-red-950/20 text-red-300/80"
                          : "border-border bg-white text-neutral-600"
                      }`}
                    >
                      你站在走廊的白光下，听见墙壁深处传来缓慢而克制的吞咽声。请描述你的第一个动作。
                    </div>
                  )}
                </div>
              </div>

              <div className={`border-t p-4 ${isDarkMoon ? "border-red-900/50" : "border-border"}`}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value.slice(0, MAX_INPUT))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") onSubmit();
                    }}
                    maxLength={MAX_INPUT}
                    placeholder="最多 20 字：例如「用手电筒照镜子」"
                    className={`h-12 w-full rounded-xl border px-4 text-sm outline-none transition ${
                      isDarkMoon
                        ? "border-red-900/50 bg-red-950/50 text-red-100 placeholder:text-red-400/50 focus:border-red-700"
                        : "border-border bg-white focus:border-neutral-400"
                    }`}
                    disabled={isStreaming}
                  />
                  <button
                    type="button"
                    onClick={onSubmit}
                    disabled={isStreaming || input.trim().length === 0 || input.trim().length > MAX_INPUT}
                    className={`h-12 shrink-0 rounded-xl px-6 text-sm font-semibold transition disabled:opacity-40 ${
                      isDarkMoon ? "bg-red-900 text-red-100" : "bg-foreground text-background"
                    }`}
                  >
                    提交
                  </button>
                </div>
                <div className={`mt-2 flex items-center justify-between text-xs ${isDarkMoon ? "text-red-300/80" : "text-neutral-600"}`}>
                  <span>
                    字数：{input.trim().length}/{MAX_INPUT}
                  </span>
                  <span className={input.trim().length > MAX_INPUT ? "text-danger" : ""}>
                    {input.trim().length > MAX_INPUT
                      ? "动作过长：将被公寓拒绝。"
                      : isStreaming
                        ? "深渊 DM 正在推演..."
                        : "保持简短。保持真实。"}
                  </span>
                </div>
                <div className={`mt-2 text-[11px] ${isDarkMoon ? "text-red-400/60" : "text-neutral-500"}`}>
                  {rawDmBuffer ? "（调试）已接收流式 JSON 输出。" : null}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

