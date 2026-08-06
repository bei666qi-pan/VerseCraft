export function isLikelyValidDMJson(content: string): boolean {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    return typeof parsed?.narrative === "string";
  } catch {
    return false;
  }
}

/**
 * Strip SSE control frame patterns, JSON injection artifacts, and dangerous
 * DM JSON field overrides from raw model output before it is wrapped into
 * synthetic DM JSON.  A malicious or corrupted model response could carry
 * fragments such as `__VERSECRAFT_STATUS__:`, `__VERSECRAFT_FINAL__:`,
 * `data: `, or attempts to force `is_action_legal: false` / `is_death: true`.
 *
 * Brace removal is targeted: only braces that form JSON structure delimiters
 * are stripped (e.g. `{"key":` or `"value"}`).  Legitimate brace characters
 * in prose — CJK brackets, code snippets, etc. — are preserved.
 */
function stripSseControlFrames(raw: string): string {
  return (
    raw
      // Drop entire lines that contain SSE control markers.
      .split("\n")
      .filter(
        (line) =>
          !line.includes("__VERSECRAFT_STATUS__") &&
          !line.includes("__VERSECRAFT_FINAL__") &&
          !/^\s*data:\s/.test(line),
      )
      .join("\n")
      // Strip attempts to inject dangerous DM JSON field values.
      // Also handles the case where brace stripping left a leading " (e.g. "is_action_legal": false).
      .replace(/"?(is_action_legal)"?\s*:\s*false/gi, "")
      .replace(/"?(is_death)"?\s*:\s*true/gi, "")
      // Targeted brace removal: only strip braces that form JSON injection patterns.
      // This prevents JSON object/array delimiters from being injected into the
      // narrative text while preserving legitimate brace usage in prose.
      .replace(/\{\s*"/g, '"')                        // {"key" → "key" (JSON object open + key)
      .replace(/"\s*\}/g, '"')                         // "value"} → "value" (JSON string value + close)
      .replace(/(true|false|null)\s*\}/gi, '$1')       // true/false/null} → value (JSON literal + close)
      .replace(/\}\s*,/g, ',')                          // }, → , (JSON object close before comma)
      .replace(/^\s*\{/, '')                            // Leading { (solitary open brace at start)
      .replace(/\}\s*$/, '')                            // Trailing } (solitary close brace at end)
  );
}

export function sanitizeAssistantContent(content: string): string {
  if (isLikelyValidDMJson(content)) return content;

  const narrative = stripSseControlFrames(content).slice(0, 500);

  return JSON.stringify({
    is_action_legal: true,
    sanity_damage: 0,
    narrative,
    is_death: false,
    consumes_time: true,
  });
}
