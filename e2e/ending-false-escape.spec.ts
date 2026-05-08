import { test } from "@playwright/test";
import { runEndingE2E } from "./fixtures/endingMocks";

test("false escape ending commits a snapshot and reaches settlement", async ({ page }) => {
  await runEndingE2E(page, {
    scenario: "false_escape",
    action: "相信镜中出口",
    expectedOutcome: "false_escape",
  });
});
