import assert from "node:assert/strict";
import test from "node:test";
import { getPrunedUiRedirectPath, PRUNED_UI_REDIRECT_PATH } from "./prunedUiRoutes";

test("pruned UI routes redirect to the narrative play surface", () => {
  for (const path of [
    "/guide",
    "/help/quickstart",
    "/tutorial",
    "/manual",
    "/notes",
    "/journal/archive",
    "/inventory",
    "/warehouse",
    "/storage",
    "/bag",
    "/backpack",
    "/items",
    "/achievements",
    "/achievement",
    "/badge",
    "/trophies",
    "/weapon",
    "/weapons",
    "/armory",
    "/arsenal",
    "/equipment",
    "/equip",
    "/taskbar",
    "/tasks",
    "/task",
    "/toolbar",
    "/dock",
    "/bottom-bar",
    "/sidebar",
    "/action-bar",
  ]) {
    assert.equal(getPrunedUiRedirectPath(path), PRUNED_UI_REDIRECT_PATH, path);
  }
});

test("non-pruned app routes do not redirect", () => {
  for (const path of ["/", "/play", "/intro", "/create", "/settlement", "/api/chat", "/legal/privacy-policy"]) {
    assert.equal(getPrunedUiRedirectPath(path), null, path);
  }
});
