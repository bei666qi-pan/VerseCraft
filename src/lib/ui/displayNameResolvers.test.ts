import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveFloorTierLabel,
  resolveItemIdForPlayer,
  resolveNpcIdForPlayer,
  resolveNpcRefListForPlayer,
  resolveTaskIssuerDisplay,
} from "./displayNameResolvers";

test("resolveNpcIdForPlayer 不裸展示 registry id", () => {
  assert.equal(resolveNpcIdForPlayer("N-015", {}), "麟泽");
  assert.equal(resolveNpcIdForPlayer("N-999", {}), "某位住户");
});

test("resolveFloorTierLabel 用地名而非裸 FloorId", () => {
  assert.equal(resolveFloorTierLabel("B1"), "地下一层");
});

test("resolveNpcRefListForPlayer 手记关联", () => {
  assert.equal(resolveNpcRefListForPlayer(["N-008", "N-010"], {}), "电工老刘、欣蓝");
});

test("resolveTaskIssuerDisplay：issuerName 为 id 时兜底", () => {
  assert.equal(resolveTaskIssuerDisplay("N-008", "N-008", {}), "电工老刘");
});

test("resolveItemIdForPlayer 未知 id 泛称", () => {
  assert.equal(resolveItemIdForPlayer("__no_such_item__"), "未知道具");
});
