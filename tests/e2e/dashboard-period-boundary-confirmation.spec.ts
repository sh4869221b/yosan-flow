import { test } from "@playwright/test";
import { resetTestData } from "./dashboard-shared";
import { registerPeriodBoundaryAdversarialScenarios } from "./period-boundary-confirmation-adversarial-scenarios";
import { registerPeriodBoundarySuccessScenarios } from "./period-boundary-confirmation-success-scenarios";

test.beforeEach(async ({ request }) => {
  await resetTestData(request);
});

registerPeriodBoundarySuccessScenarios();
registerPeriodBoundaryAdversarialScenarios();
