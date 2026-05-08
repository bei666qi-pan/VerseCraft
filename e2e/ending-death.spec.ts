import { test } from "@playwright/test";
import { runEndingE2E } from "./fixtures/endingMocks";

test("death ending commits a snapshot and reaches settlement", async ({ page }) => {
  await runEndingE2E(page, {
    scenario: "death",
    action: "靠近黑影",
    expectedOutcome: "death",
  });
});
