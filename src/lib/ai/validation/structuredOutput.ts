// src/lib/ai/validation/structuredOutput.ts
/** True when body looks like a single JSON object (after common markdown fences). */
export function isValidJsonObjectString(content: string): boolean {
  const t = content.trim().replace(/^```json\s*|```$/g, "").trim();
  if (!t) return false;
  try {
    const o = JSON.parse(t) as unknown;
    return typeof o === "object" && o !== null && !Array.isArray(o);
  } catch {
    return false;
  }
}
