// src/lib/ai/tools/mechanicsIntentClassifier/embeddings.test.ts
//
// §2.4 防世界跨世界幻觉硬约束：每个 seed 表都不应包含对方世界专属 NPC / 物品 / 地名。
// 这是一个 grep 风格的回归测试，确保 build 脚本产出的 seed 表满足 §2.4 边界。

import test from "node:test";
import assert from "node:assert/strict";

import { DARKMOON_MECHANICS_SEEDS, DARKMOON_MECHANICS_SEED_COUNT, DARKMOON_MECHANICS_EMBEDDING_DIMENSION } from "./embeddings/darkMoonMechanics";
import { XINGNI_MECHANICS_SEEDS, XINGNI_MECHANICS_SEED_COUNT, XINGNI_MECHANICS_EMBEDDING_DIMENSION } from "./embeddings/xingniMechanics";

// 暗月专属 NPC / 物品 / 地名（任一出现即视为种子污染）
const DARK_MOON_EXCLUSIVES = [
  // NPC
  "陈砚",
];

// 星逆专属 NPC / 物品 / 地名
const XINGNI_EXCLUSIVES = [
  // NPC
  "白葵", "苏木", "柳三娘",
  // 地名
  "如月公寓", "B1_SafeZone", "1F_Lobby", "QS_GUOYAN_INN", "青石县",
];

test("dark moon seed table contains no 暗月专属 NPC (defensive: 陈砚)", () => {
  for (const seed of DARKMOON_MECHANICS_SEEDS) {
    assert.ok(
      !seed.phrase.includes("陈砚"),
      `dark moon seed phrase "${seed.phrase}" leaks 暗月专属 NPC "陈砚"`,
    );
  }
});

test("dark moon seed table contains no 星逆专属 NPC / 地名", () => {
  for (const seed of DARKMOON_MECHANICS_SEEDS) {
    for (const exclusive of XINGNI_EXCLUSIVES) {
      assert.ok(
        !seed.phrase.includes(exclusive),
        `dark moon seed phrase "${seed.phrase}" leaks 星逆专属 "${exclusive}"`,
      );
    }
  }
});

test("xingni seed table contains no 暗月专属 NPC", () => {
  for (const seed of XINGNI_MECHANICS_SEEDS) {
    for (const exclusive of DARK_MOON_EXCLUSIVES) {
      assert.ok(
        !seed.phrase.includes(exclusive),
        `xingni seed phrase "${seed.phrase}" leaks 暗月专属 "${exclusive}"`,
      );
    }
  }
});

test("xingni seed table contains no 星逆专属 NPC / 地名", () => {
  for (const seed of XINGNI_MECHANICS_SEEDS) {
    for (const exclusive of XINGNI_EXCLUSIVES) {
      assert.ok(
        !seed.phrase.includes(exclusive),
        `xingni seed phrase "${seed.phrase}" leaks 星逆专属 "${exclusive}"`,
      );
    }
  }
});

test("dark moon seed table metadata is consistent", () => {
  assert.strictEqual(DARKMOON_MECHANICS_SEEDS.length, DARKMOON_MECHANICS_SEED_COUNT);
  assert.ok(DARKMOON_MECHANICS_EMBEDDING_DIMENSION > 0);
  for (const seed of DARKMOON_MECHANICS_SEEDS) {
    assert.strictEqual(seed.vector.length, DARKMOON_MECHANICS_EMBEDDING_DIMENSION);
  }
});

test("xingni seed table metadata is consistent", () => {
  assert.strictEqual(XINGNI_MECHANICS_SEEDS.length, XINGNI_MECHANICS_SEED_COUNT);
  assert.ok(XINGNI_MECHANICS_EMBEDDING_DIMENSION > 0);
  for (const seed of XINGNI_MECHANICS_SEEDS) {
    assert.strictEqual(seed.vector.length, XINGNI_MECHANICS_EMBEDDING_DIMENSION);
  }
});
