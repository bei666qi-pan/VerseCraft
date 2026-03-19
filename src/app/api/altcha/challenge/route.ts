// src/app/api/altcha/challenge/route.ts
import { createChallenge } from "altcha-lib";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";

const HMAC_KEY = env.altchaHmacKey ?? env.authSecret;

export async function GET() {
  try {
    const challenge = await createChallenge({
      hmacKey: HMAC_KEY,
      maxNumber: 100_000,
      algorithm: "SHA-256",
    });
    return NextResponse.json(challenge);
  } catch (err) {
    console.error("[altcha] challenge creation failed", err);
    return NextResponse.json({ error: "Challenge generation failed" }, { status: 500 });
  }
}
