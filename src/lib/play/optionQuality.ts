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

function canonicalizeOptionVerb(text: string): string {
  return text
    .replace(/(查看|检查|观察|审视|打量)/g, "观察")
    .replace(/(前往|去往|去|走向|靠近|移动到)/g, "前往")
    .replace(/(询问|打听|追问|盘问)/g, "询问")
    .replace(/(尝试|试着|设法)/g, "尝试");
}

export function buildOptionSemanticKey(text: string): string {
  const normalized = String(text ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[，。！？；：“”"'、,.!?;:()（）【】\[\]《》<>]/g, "");
  if (!normalized) return "";
  return canonicalizeOptionVerb(normalized);
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

export function isOverGenericNarrativeOption(text: string): boolean {
  const s = String(text ?? "").trim().replace(/\s+/g, "");
  if (!s) return true;
  return (
    /观察四周/.test(s) ||
    /思考下一步/.test(s) ||
    /继续前进/.test(s) ||
    /保持警惕/.test(s) ||
    /先看看情况/.test(s) ||
    /随机探索/.test(s) ||
    /谨慎行事/.test(s)
  );
}
