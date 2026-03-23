import { normalizeForHash } from "./normalize";

/** 与 vc_semantic_cache.request_embedding / migrate 中 vector(256) 一致。 */
export const VC_EMBED_DIM = 256;

function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function l2Normalize(vec: number[]): number[] {
  let sum = 0;
  for (const x of vec) sum += x * x;
  const norm = Math.sqrt(sum);
  if (norm === 0 || !Number.isFinite(norm)) {
    return vec.map(() => 0);
  }
  return vec.map((x) => x / norm);
}

/**
 * 确定性本地 embedding：字符 n-gram（码点窗口）哈希入桶，零上游 Token。
 * 向量 L2 归一化，便于与 pgvector cosine / <=> 一致解释。
 */
export function embedText(input: string): number[] {
  const norm = normalizeForHash(input);
  const vec = new Array<number>(VC_EMBED_DIM).fill(0);
  if (norm.length === 0) {
    vec[0] = 1;
    return l2Normalize(vec);
  }

  const codepoints = [...norm];
  const n = 3;
  for (let i = 0; i <= codepoints.length - n; i++) {
    const gram = codepoints.slice(i, i + n).join("");
    const h = fnv1a32(gram);
    vec[h % VC_EMBED_DIM] += 1;
  }
  if (codepoints.length < n) {
    const h = fnv1a32(norm);
    vec[h % VC_EMBED_DIM] += 1;
  }
  return l2Normalize(vec);
}

/** PostgreSQL vector 字面量，用于参数化 ::vector 转换。 */
export function toPgVectorLiteral(vec: number[]): string {
  if (vec.length !== VC_EMBED_DIM) {
    throw new Error(`expected dim ${VC_EMBED_DIM}, got ${vec.length}`);
  }
  return `[${vec.map((x) => (Number.isFinite(x) ? x.toFixed(8) : "0")).join(",")}]`;
}
