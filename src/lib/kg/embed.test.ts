import { test } from "node:test";
import assert from "node:assert/strict";
import { VC_EMBED_DIM, embedText, toPgVectorLiteral } from "./embed";

test("embedText 维度与确定性", () => {
  const a = embedText("云海城特产星光草");
  const b = embedText("云海城特产星光草");
  assert.equal(a.length, VC_EMBED_DIM);
  assert.equal(b.length, VC_EMBED_DIM);
  for (let i = 0; i < VC_EMBED_DIM; i++) assert.equal(a[i], b[i]);
});

test("embedText L2 归一化（约单位长度）", () => {
  const v = embedText("测试归一化向量长度");
  let s = 0;
  for (const x of v) s += x * x;
  assert.ok(Math.abs(s - 1) < 1e-5 || s === 0);
});

test("toPgVectorLiteral 格式", () => {
  const v = embedText("x");
  const lit = toPgVectorLiteral(v);
  assert.ok(lit.startsWith("[") && lit.endsWith("]"));
  assert.ok(!lit.includes(" "));
  const parts = lit.slice(1, -1).split(",");
  assert.equal(parts.length, VC_EMBED_DIM);
});
