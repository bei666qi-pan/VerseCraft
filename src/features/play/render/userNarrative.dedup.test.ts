import assert from "node:assert/strict";
import test from "node:test";
import {
  extractQuotedUtteranceForDedup,
  filterDisplayEntriesForUserQuoteDedup,
  formatUserNarrativeForDisplay,
  shouldSuppressUserDisplayEntry,
} from "./userNarrative";

test("extractQuotedUtteranceForDedup: quote-only display", () => {
  assert.equal(extractQuotedUtteranceForDedup("“上面是哪里？”"), "上面是哪里？");
});

test("extractQuotedUtteranceForDedup: legacy 脱口而出 line", () => {
  assert.equal(extractQuotedUtteranceForDedup("“上面是哪里？”我脱口而出。"), "上面是哪里？");
});

test("extractQuotedUtteranceForDedup: non-matching returns null", () => {
  assert.equal(extractQuotedUtteranceForDedup("我查看门锁。"), null);
  assert.equal(extractQuotedUtteranceForDedup(""), null);
});

test("shouldSuppressUserDisplayEntry: narrative embeds same quote", () => {
  const userLine = formatUserNarrativeForDisplay("B1的诡异呢");
  assert.equal(userLine, "“B1的诡异呢？”");
  assert.equal(
    shouldSuppressUserDisplayEntry(userLine, "“B1的诡异呢？”我看着老刘和灵伤。"),
    true
  );
});

test("shouldSuppressUserDisplayEntry: narrative without quote keeps user", () => {
  const userLine = formatUserNarrativeForDisplay("上面是哪里");
  assert.equal(shouldSuppressUserDisplayEntry(userLine, "走廊尽头有一扇门。"), false);
});

test("shouldSuppressUserDisplayEntry: inner too short is not suppressed", () => {
  assert.equal(shouldSuppressUserDisplayEntry("“好呀”", "“好呀”他说。"), false);
});

test("filterDisplayEntriesForUserQuoteDedup: removes user when next assistant repeats quote", () => {
  const entries = [
    { role: "user" as const, content: "上面是哪里", logIndex: 0 },
    {
      role: "assistant" as const,
      content: "“上面是哪里？”我环顾四周，压低声音。",
      logIndex: 1,
    },
  ];
  const out = filterDisplayEntriesForUserQuoteDedup(entries);
  assert.equal(out.length, 1);
  assert.equal(out[0]!.role, "assistant");
});

test("filterDisplayEntriesForUserQuoteDedup: keeps user when assistant does not repeat", () => {
  const entries = [
    { role: "user" as const, content: "上面是哪里", logIndex: 0 },
    { role: "assistant" as const, content: "灯光闪了一下。", logIndex: 1 },
  ];
  const out = filterDisplayEntriesForUserQuoteDedup(entries);
  assert.equal(out.length, 2);
});

test("shouldSuppressUserDisplayEntry: legacy 脱口而出 formatted line still matches", () => {
  assert.equal(
    shouldSuppressUserDisplayEntry(
      "“上面是哪里？”我脱口而出。",
      "“上面是哪里？”我看向天花板。"
    ),
    true
  );
});
