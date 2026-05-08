import { test } from "@playwright/test";
import { runEndingE2E } from "./fixtures/endingMocks";

test("doom ending commits a snapshot and reaches settlement", async ({ page }) => {
  await runEndingE2E(page, {
    scenario: "doom",
    action: "继续等待",
    expectedOutcome: "doom",
  });
});
