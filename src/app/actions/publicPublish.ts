"use server";

import { moderateInputOnServer } from "@/lib/safety/input/pipeline";

export type SubmitPublicPublishDraftInput = {
  text: string;
};

export type SubmitPublicPublishDraftResult =
  | { ok: true; text: string; message: string; decision: "allow" | "rewrite" | "fallback" }
  | { ok: false; message: string };

/**
 * Phase3: public publish input gateway (future UI can call this before actually publishing).
 * This does NOT persist anything; it only validates/moderates the text.
 */
export async function submitPublicPublishDraft(
  input: SubmitPublicPublishDraftInput
): Promise<SubmitPublicPublishDraftResult> {
  const raw = String(input.text ?? "");
  const r = await moderateInputOnServer({
    scene: "public_publish_input",
    text: raw,
    sessionId: "system",
  });

  if (r.decision === "reject") {
    return { ok: false, message: r.userMessage };
  }
  if (r.decision === "allow") {
    return { ok: true, text: r.text, message: "ok", decision: "allow" };
  }
  if (r.decision === "rewrite") {
    return { ok: true, text: r.text, message: r.userMessage, decision: "rewrite" };
  }
  return { ok: true, text: r.text, message: r.userMessage, decision: "fallback" };
}

