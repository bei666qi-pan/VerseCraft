import { test } from "@playwright/test";
import { runEndingE2E } from "./fixtures/endingMocks";

test("costly escape ending commits a snapshot and reaches settlement", async ({ page }) => {
  await runEndingE2E(page, {
    scenario: "costly_escape",
    action: "付出代价通过",
    expectedOutcome: "costly_escape",
  });
});
