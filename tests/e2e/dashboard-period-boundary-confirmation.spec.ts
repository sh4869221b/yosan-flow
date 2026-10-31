import "./period-boundary-confirmation-success-scenarios";
import "./period-boundary-confirmation-adversarial-scenarios";
import "./period-boundary-confirmation-recovery-scenarios";
import { test } from "@playwright/test";
import { resetTestData } from "./dashboard-shared";

test.beforeEach(async ({ request }) => {
  await resetTestData(request);
});
