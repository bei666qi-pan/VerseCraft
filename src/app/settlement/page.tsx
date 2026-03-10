"use client";

import { useEffect, useState } from "react";
import { useGameStore } from "@/store/useGameStore";
import { submitGameRecord } from "@/app/actions/leaderboard";

type LogEntry = { role: string; content: string; reasoning?: string };

function buildMarkdown(logs: LogEntry[]): string {
  const lines: string[] = [
    "# 文界工坊 · 生存记录",
    "",
    "---",
    "",
  ];

  for (const entry of logs) {
    if (entry.role === "user") {
      lines.push("## 玩家动作");
      lines.push("");
      lines.push(entry.content);
      lines.push("");
      lines.push("---");
      lines.push("");
    } else if (entry.role === "assistant") {
      lines.push("## DM 叙事");
      lines.push("");
      lines.push(entry.content);
      lines.push("");

      if (entry.reasoning && entry.reasoning.trim().length > 0) {
        lines.push("<details>");
        lines.push("<summary>推理过程（折叠）</summary>");
        lines.push("");
        lines.push(entry.reasoning);
        lines.push("");
        lines.push("</details>");
        lines.push("");
      }

      lines.push("---");
      lines.push("");
    } else if (entry.role === "system") {
      lines.push("## 系统指令");
      lines.push("");
      lines.push("```");
      lines.push(entry.content);
      lines.push("```");
      lines.push("");
      lines.push("---");
      lines.push("");
    }
  }

  return lines.join("\n");
}

function triggerDownload(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/markdown; charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function resolveFloorScore(location: string): number {
  if (!location) return 0;
  if (location.startsWith("B2_")) return 99;
  if (location.startsWith("B1_")) return 0;
  const match = location.match(/^(\d)F_/);
  if (!match) return 0;
  return Number(match[1] ?? 0);
}

function estimateKilledAnomalies(logs: LogEntry[]): number {
  const text = logs
    .filter((item) => item.role === "assistant")
    .map((item) => item.content)
    .join("\n");
  const matches = text.match(/击杀.{0,8}诡异|诡异.{0,8}击杀/g);
  return matches ? Math.max(0, matches.length) : 0;
}

export default function SettlementPage() {
  const [mounted, setMounted] = useState(false);
  const [recorded, setRecorded] = useState(false);

  const stats = useGameStore((s) => s.stats);
  const logs = useGameStore((s) => s.logs ?? []);
  const time = useGameStore((s) => s.time ?? { day: 0, hour: 0 });
  const playerLocation = useGameStore((s) => s.playerLocation ?? "B1_SafeZone");

  const sanity = stats?.sanity ?? 0;
  const isDead = sanity <= 0;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    useGameStore.getState().clearSaveDataKeepLogs();
  }, [mounted]);

  useEffect(() => {
    if (!mounted || recorded) return;
    setRecorded(true);
    const survivalTimeSeconds = Math.max(0, ((time.day ?? 0) * 24 + (time.hour ?? 0)) * 3600);
    const payload = {
      killedAnomalies: estimateKilledAnomalies(logs),
      maxFloorScore: resolveFloorScore(playerLocation),
      survivalTimeSeconds,
    };
    void submitGameRecord(payload);
  }, [logs, mounted, playerLocation, recorded, time.day, time.hour]);

  if (!mounted) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="animate-pulse text-neutral-500">结算中...</div>
      </main>
    );
  }

  function handleExport() {
    const md = buildMarkdown(logs);
    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    triggerDownload(md, `versecraft-生存记录-${ts}.md`);
  }

  async function handleRestart() {
    const p = useGameStore.persist.clearStorage();
    if (p && typeof (p as Promise<unknown>).then === "function") {
      await (p as Promise<void>);
    }
    window.location.href = "/";
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 py-16">
        <div className="w-full space-y-12 rounded-2xl border border-border bg-white p-10 shadow-sm">
          <header className="text-center">
            <h1
              className={`text-3xl font-semibold tracking-tight ${
                isDead ? "text-danger" : "text-neutral-900"
              }`}
            >
              {isDead
                ? "理智归零，你已成为公寓的一部分"
                : "你暂时逃离了高维肠胃"}
            </h1>
            <p className="mt-4 text-sm text-neutral-600">
              {isDead
                ? "如月公寓的消化系统已将你纳入。"
                : "你暂时离开了那栋楼，但规则会记住你。"}
            </p>
          </header>

          <section className="rounded-2xl border border-border bg-muted px-6 py-6">
            <h2 className="text-sm font-semibold text-neutral-900">最终数据</h2>
            <div className="mt-5 grid grid-cols-2 gap-4">
              <div className="rounded-xl border border-border bg-white px-4 py-3">
                <div className="text-xs text-neutral-600">存活时间</div>
                <div className="mt-1 text-xl font-semibold text-neutral-900">
                  {time.day} 日 {time.hour} 时
                </div>
              </div>
              <div className="rounded-xl border border-border bg-white px-4 py-3">
                <div className="text-xs text-neutral-600">剩余理智</div>
                <div
                  className={`mt-1 text-xl font-semibold ${
                    sanity <= 0 ? "text-danger" : "text-neutral-900"
                  }`}
                >
                  {sanity}
                </div>
              </div>
            </div>
          </section>

          <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={handleExport}
              className="h-12 rounded-xl border border-border bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-muted"
            >
              导出生存记录 (.md)
            </button>
            <button
              type="button"
              onClick={handleRestart}
              className="h-12 rounded-xl bg-foreground px-6 text-sm font-semibold text-background transition hover:opacity-90"
            >
              重新开始
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
