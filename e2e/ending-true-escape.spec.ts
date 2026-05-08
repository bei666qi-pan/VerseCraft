import { test } from "@playwright/test";
import { runEndingE2E } from "./fixtures/endingMocks";

test("true escape ending commits a snapshot and reaches settlement", async ({ page }) => {
  await runEndingE2E(page, {
    scenario: "true_escape",
    action: "推开真正的门",
    expectedOutcome: "true_escape",
  });
});
