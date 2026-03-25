import { createHash } from "node:crypto";

export type PrecheckVerdict =
  | { ok: true; sanitizedText: string; flags: string[] }
  | { ok: false; reasonCode: string; userMessage: string; flags: string[] };

const MAX_PRIVATE_ACTION_CHARS = 800;
const MAX_GENERIC_FORM_CHARS = 2000;
const MAX_PROFILE_CHARS = 32;

function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function stripControlChars(s: string): string {
  return s.replace(/[\u0000-\u001f\u007f]/g, "");
}

function normalizeWhitespace(s: string): string {
  return s.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/[ \t]+/g, " ").trim();
}

function looksLikeScriptPayload(s: string): boolean {
  return /(<script|javascript:|onerror=|onload=|data:text\/html|%3cscript|\/etc\/passwd|C:\\\\Windows\\\\System32|\.\.\/|\.\.\\)/i.test(
    s
  );
}

function looksLikeObviousAdOrContact(s: string): boolean {
  // lightweight: detect marketing + contact hints; avoid blocking pure narrative numbers.
  if (/(加群|群号|推广|代理|代充|返利|刷单|招募|兼职|联系我|私信我|vx|微信|QQ)/i.test(s)) return true;
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(s)) return true;
  if (/(https?:\/\/|www\.)/i.test(s) && /(购买|下单|联系|加|进)/.test(s)) return true;
  return false;
}

type RepeatState = { lastHash: string; lastAtMs: number; count: number };
const repeatMemo = new Map<string, RepeatState>();
const REPEAT_WINDOW_MS = 20_000;
const REPEAT_THRESHOLD = 3;

export function precheckUserInput(args: {
  scene: "private_story_action" | "profile_input" | "feedback_input" | "report_input" | "public_publish_input" | "search_or_comment_like_input";
  text: string;
  actorKey: string; // e.g. userIdHash/sessionIdHash/ipHash
}): PrecheckVerdict {
  const flags: string[] = [];
  let text = normalizeWhitespace(stripControlChars(args.text ?? ""));

  if (!text) {
    return { ok: false, reasonCode: "empty_input", userMessage: "内容不能为空。", flags: ["empty"] };
  }

  if (looksLikeScriptPayload(text)) {
    return { ok: false, reasonCode: "malicious_payload_precheck", userMessage: "内容格式异常，无法提交。", flags: ["malicious_payload"] };
  }

  if (looksLikeObviousAdOrContact(text)) {
    flags.push("ad_or_contact_hint");
  }

  // Scene-specific length caps (precheck only; later policy may still rewrite/fallback).
  const cap =
    args.scene === "private_story_action"
      ? MAX_PRIVATE_ACTION_CHARS
      : args.scene === "profile_input"
        ? MAX_PROFILE_CHARS
        : MAX_GENERIC_FORM_CHARS;
  if (text.length > cap) {
    // Keep some head to avoid feeding overlong text to providers/models.
    text = text.slice(0, cap);
    flags.push("trimmed_by_cap");
  }

  // Repeat spam: per actorKey (hashed) + text fingerprint.
  const fp = sha256Hex(text);
  const key = `${args.actorKey}:${args.scene}`;
  const now = Date.now();
  const prev = repeatMemo.get(key);
  if (prev && prev.lastHash === fp && now - prev.lastAtMs < REPEAT_WINDOW_MS) {
    prev.count += 1;
    prev.lastAtMs = now;
    if (prev.count >= REPEAT_THRESHOLD) {
      return {
        ok: false,
        reasonCode: "repeat_spam",
        userMessage: "提交过于频繁或内容重复，请稍后再试。",
        flags: ["repeat_spam"],
      };
    }
  } else {
    repeatMemo.set(key, { lastHash: fp, lastAtMs: now, count: 1 });
  }

  return { ok: true, sanitizedText: text, flags };
}

