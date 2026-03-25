"use server";

import { moderateInputOnServer } from "@/lib/safety/input/pipeline";

export type SubmitCommentDraftInput = {
  text: string;
};

export type SubmitCommentDraftResult =
  | { ok: true; text: string; message: string; decision: "allow" | "rewrite" | "fallback" }
  | { ok: false; message: string };

/**
 * Phase3: search/comment-like input gateway (future UI can call this).
 * Does not persist anything.
 */
export async function submitCommentDraft(input: SubmitCommentDraftInput): Promise<SubmitCommentDraftResult> {
  const raw = String(input.text ?? "");
  const r = await moderateInputOnServer({
    scene: "search_or_comment_like_input",
    text: raw,
    sessionId: "system",
  });

  if (r.decision === "reject") return { ok: false, message: r.userMessage };
  if (r.decision === "allow") return { ok: true, text: r.text, message: "ok", decision: "allow" };
  if (r.decision === "rewrite") return { ok: true, text: r.text, message: r.userMessage, decision: "rewrite" };
  return { ok: true, text: r.text, message: r.userMessage, decision: "fallback" };
}

