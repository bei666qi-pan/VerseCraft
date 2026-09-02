import test from "node:test";
import assert from "node:assert/strict";
import {
  LEADERBOARD_DEFAULT_LIMIT,
  LEADERBOARD_MAX_LIMIT,
  clampLeaderboardLimit,
  clampLeaderboardOffset,
  deriveLeaderboardDisplayName,
  normalizeLeaderboardQuery,
} from "./utils";

test("clampLeaderboardLimit returns default for missing/zero/non-finite", () => {
  assert.equal(clampLeaderboardLimit(undefined), LEADERBOARD_DEFAULT_LIMIT);
  assert.equal(clampLeaderboardLimit(0), LEADERBOARD_DEFAULT_LIMIT);
  assert.equal(clampLeaderboardLimit(-5), LEADERBOARD_DEFAULT_LIMIT);
  assert.equal(clampLeaderboardLimit(Number.NaN), LEADERBOARD_DEFAULT_LIMIT);
  assert.equal(clampLeaderboardLimit(Number.POSITIVE_INFINITY), LEADERBOARD_DEFAULT_LIMIT);
});

test("clampLeaderboardLimit clamps to MAX and floors fractional", () => {
  assert.equal(clampLeaderboardLimit(999), LEADERBOARD_MAX_LIMIT);
  assert.equal(clampLeaderboardLimit(LEADERBOARD_MAX_LIMIT + 1), LEADERBOARD_MAX_LIMIT);
  assert.equal(clampLeaderboardLimit(10.7), 10);
  assert.equal(clampLeaderboardLimit(7), 7);
});

test("clampLeaderboardOffset returns 0 for negative / non-finite", () => {
  assert.equal(clampLeaderboardOffset(undefined), 0);
  assert.equal(clampLeaderboardOffset(-3), 0);
  assert.equal(clampLeaderboardOffset(Number.NaN), 0);
  assert.equal(clampLeaderboardOffset(10.9), 10);
});

test("deriveLeaderboardDisplayName masks userId with prefix", () => {
  assert.equal(deriveLeaderboardDisplayName("oidc-abc123def456"), "匿名旅人 #oidc-abc");
  // 非法字符被剥除；全空则退化为兜底。
  assert.equal(deriveLeaderboardDisplayName("@@@@"), "匿名旅人");
  assert.equal(deriveLeaderboardDisplayName(""), "匿名旅人");
  // 仅取前 8 位；剩余截断。
  assert.equal(deriveLeaderboardDisplayName("12345678extra"), "匿名旅人 #12345678");
});

test("normalizeLeaderboardQuery composes all helpers", () => {
  assert.deepEqual(
    normalizeLeaderboardQuery({ outcome: "died", grade: "S", limit: 99, offset: -1 }),
    { outcome: "died", grade: "S", limit: LEADERBOARD_MAX_LIMIT, offset: 0 }
  );
  assert.deepEqual(
    normalizeLeaderboardQuery({}),
    { outcome: null, grade: null, limit: LEADERBOARD_DEFAULT_LIMIT, offset: 0 }
  );
});

test("outcome and grade enum allow lists", () => {
  // Type-level: only valid values compile; runtime helper returns them through normalizeLeaderboardQuery.
  const allowed: Array<"died" | "survived" | "escaped"> = ["died", "survived", "escaped"];
  for (const o of allowed) {
    const n = normalizeLeaderboardQuery({ outcome: o });
    assert.equal(n.outcome, o);
  }
  const grades: Array<"S" | "A" | "B" | "C" | "D" | "E"> = ["S", "A", "B", "C", "D", "E"];
  for (const g of grades) {
    const n = normalizeLeaderboardQuery({ grade: g });
    assert.equal(n.grade, g);
  }
});