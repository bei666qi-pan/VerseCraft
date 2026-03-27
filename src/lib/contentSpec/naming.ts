export function isNpcId(id: string): boolean {
  return /^N-\d{3}$/.test(String(id ?? ""));
}

export function isTaskSpecId(id: string): boolean {
  const s = String(id ?? "");
  return /^task\.[a-z0-9_.-]+$/.test(s) || /^main\.[a-z0-9_.-]+$/.test(s);
}

export function isEscapeConditionCode(code: string): boolean {
  return /^escape\.condition\.[a-z0-9_.-]+$/.test(String(code ?? ""));
}

export function isEscapeFragmentCode(code: string): boolean {
  return /^escape\.fragment\.[a-z0-9_.-]+$/.test(String(code ?? ""));
}

export function isEscapeFalseLeadCode(code: string): boolean {
  return /^escape\.falselead\.[a-z0-9_.-]+$/.test(String(code ?? ""));
}

export function clampText(s: unknown, maxChars: number): string {
  const t = String(s ?? "").trim();
  if (!t) return "";
  return t.length <= maxChars ? t : t.slice(0, maxChars);
}

