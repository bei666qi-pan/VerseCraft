"use server";

import { moderateInputOnServer } from "@/lib/safety/input/pipeline";

export type ValidateCharacterProfileInput = {
  name: string;
  personality: string;
};

export type ValidateCharacterProfileResult =
  | { ok: true; name: string; personality: string }
  | { ok: false; message: string };

export async function validateCharacterProfile(
  input: ValidateCharacterProfileInput
): Promise<ValidateCharacterProfileResult> {
  const name = String(input.name ?? "").trim();
  const personality = String(input.personality ?? "").trim();

  if (name.length < 2 || name.length > 12) {
    return { ok: false, message: "称呼长度不符合规范，请控制在 2-12 字以内。" };
  }
  if (personality.length < 2 || personality.length > 12) {
    return { ok: false, message: "性格长度不符合规范，请控制在 2-12 字以内。" };
  }

  const nameSafety = await moderateInputOnServer({
    scene: "profile_input",
    text: name,
    sessionId: "system",
  });
  if (nameSafety.decision !== "allow") {
    return { ok: false, message: nameSafety.userMessage };
  }

  const personalitySafety = await moderateInputOnServer({
    scene: "profile_input",
    text: personality,
    sessionId: "system",
  });
  if (personalitySafety.decision !== "allow") {
    return { ok: false, message: personalitySafety.userMessage };
  }

  return { ok: true, name, personality };
}

