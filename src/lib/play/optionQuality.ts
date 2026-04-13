export function isNonNarrativeOptionLike(text: string): boolean {
  const s = String(text ?? "").trim().replace(/\s+/g, "");
  if (!s) return true;
  if (/(灵感手记|手记|背包|行囊|道具栏|物品栏|任务面板|属性面板|菜单|设置|保存|读档|回档|刷新选项|重新整理选项)/.test(s)) {
    return true;
  }
  if (/^(我)?(查看|检查|打开|翻看|整理|阅读)(道具|任务|属性|图鉴)$/.test(s)) return true;
  if (/^(我)?使用道具[:：]?$/.test(s)) return true;
  return false;
}

export function filterNarrativeActionOptions(options: string[], maxCount = 4): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const option of options) {
    const t = String(option ?? "").trim();
    if (!t) continue;
    if (isNonNarrativeOptionLike(t)) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= maxCount) break;
  }
  return out;
}
