import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import {
  addDays,
  getBaseUrl,
  resetTestData,
  waitForDashboardReady,
} from "./dashboard-shared";
import { seedPeriod } from "./helpers/db";
import {
  assertUnchangedPair,
  gotoTarget,
  proposeBoundaryChange,
  seedBoundaryPair,
  target,
} from "./period-boundary-confirmation-helpers";

test.describe.configure({ timeout: 120_000 });
test.beforeEach(async ({ request }) => {
  await resetTestData(request);
});

const startDate = "2026-04-10";
const endDate = addDays(startDate, 29);
const actions = [
  {
    title: "期間の終了日や予算を変更する",
    sheetTestId: "period-settings-sheet",
    inputLabel: "期間予算 (円)",
    rangeTestId: "current-period-range-start",
  },
  {
    title: "次の予算期間を作成する",
    sheetTestId: "create-period-sheet",
    inputLabel: "新規予算額 (円)",
    rangeTestId: "create-period-range-start",
  },
] as const;

async function openDashboard(
  page: Page,
  request: APIRequestContext,
  width: number,
): Promise<void> {
  await page.setViewportSize({ width, height: 812 });
  await seedPeriod(request, getBaseUrl(), {
    periodId: "p-mobile-actions",
    startDate,
    endDate,
    budgetYen: 120000,
  });
  await page.goto(`${getBaseUrl()}/?periodId=p-mobile-actions`);
  await waitForDashboardReady(page);
  await page.evaluate(() => document.fonts.ready);
}

async function dashboardLayout(page: Page) {
  return page.locator("main").evaluate((main) => ({
    mainHeight: Math.round(main.getBoundingClientRect().height),
    documentHeight: document.documentElement.scrollHeight,
  }));
}

for (const width of [320, 375]) {
  test(`opens and dismisses both action sheets without expanding the ${width}px dashboard`, async ({
    page,
    request,
  }, testInfo) => {
    await openDashboard(page, request, width);
    const layout = await dashboardLayout(page);

    for (const action of actions) {
      const trigger = page.getByRole("button", {
        name: action.title,
        exact: true,
      });
      const sheet = page.getByRole("dialog", {
        name: action.title,
        exact: true,
      });
      await expect(page.getByLabel(action.inputLabel)).not.toBeVisible();
      await trigger.click();
      await expect(sheet).toBeVisible();
      await expect(page.getByTestId(action.sheetTestId)).toBeVisible();
      await expect(sheet.getByLabel(action.inputLabel)).toBeVisible();
      await expect(page.getByLabel(action.inputLabel)).toHaveCount(1);
      await expect(page.getByTestId(action.rangeTestId)).toHaveCount(1);
      await expect.poll(() => dashboardLayout(page)).toEqual(layout);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      if (width === 375) {
        await page.screenshot({
          path: testInfo.outputPath(`${action.sheetTestId}.png`),
        });
      }

      await sheet.getByRole("button", { name: "閉じる", exact: true }).click();
      await expect(sheet).toBeHidden();
      await expect(trigger).toBeFocused();
      await trigger.click();
      await expect(sheet.getByLabel(action.inputLabel)).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(sheet).toBeHidden();
      await expect(trigger).toBeFocused();
      await expect.poll(() => dashboardLayout(page)).toEqual(layout);
    }
  });
}

test("keeps unsaved settings drafts when the mobile sheet closes and reopens", async ({
  page,
  request,
}) => {
  await openDashboard(page, request, 375);
  const writes: string[] = [];
  page.on("request", (outgoing) => {
    if (["POST", "PUT", "DELETE"].includes(outgoing.method())) {
      writes.push(outgoing.url());
    }
  });
  const trigger = page.getByRole("button", {
    name: actions[0].title,
    exact: true,
  });
  const sheet = page.getByRole("dialog", {
    name: actions[0].title,
    exact: true,
  });
  await trigger.click();
  await sheet.getByLabel("期間予算 (円)").fill("130000");
  await sheet.getByTestId("current-period-range-end").fill(addDays(endDate, 1));
  await sheet.getByRole("button", { name: "閉じる", exact: true }).click();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(sheet.getByLabel("期間予算 (円)")).toHaveValue("130000");
  await expect(sheet.getByTestId("current-period-range-end")).toHaveValue(
    addDays(endDate, 1),
  );
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(trigger).toBeFocused();
  expect(writes).toEqual([]);
});

test("additional-create cancel dismisses the mobile sheet and retains the draft", async ({
  page,
  request,
}) => {
  await openDashboard(page, request, 375);
  const trigger = page.getByRole("button", {
    name: actions[1].title,
    exact: true,
  });
  const sheet = page.getByRole("dialog", {
    name: actions[1].title,
    exact: true,
  });
  await trigger.click();
  await sheet.getByLabel("期間ID", { exact: true }).fill("p-mobile-draft");
  await sheet.getByLabel("新規予算額 (円)").fill("140000");
  await sheet.getByRole("button", { name: "取り消す", exact: true }).click();
  await expect(sheet).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(sheet.getByLabel("期間ID", { exact: true })).toHaveValue(
    "p-mobile-draft",
  );
  await expect(sheet.getByLabel("新規予算額 (円)")).toHaveValue("140000");
});

test("successful mobile additional-create closes the sheet and focuses the selected period", async ({
  page,
  request,
}) => {
  await openDashboard(page, request, 375);
  const createdPeriodId = "p-mobile-created";
  const sheet = page.getByRole("dialog", {
    name: actions[1].title,
    exact: true,
  });
  await page
    .getByRole("button", { name: actions[1].title, exact: true })
    .click();
  await sheet
    .getByTestId("create-period-range-start")
    .fill(addDays(endDate, 1));
  await sheet.getByTestId("create-period-range-end").fill(addDays(endDate, 30));
  await sheet.getByLabel("期間ID", { exact: true }).fill(createdPeriodId);
  const created = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url() === `${getBaseUrl()}/api/periods`,
  );
  await sheet.getByRole("button", { name: "期間を作成", exact: true }).click();
  expect((await created).status()).toBe(201);
  await expect(sheet).toBeHidden();
  await expect(page.getByTestId("period-select")).toHaveValue(createdPeriodId);
  await expect(page.getByTestId("period-id")).toContainText(createdPeriodId);
  await expect(page.locator("#selected-period-heading")).toBeFocused();
});

test("boundary confirmation cancellation returns to the open mobile settings sheet", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await seedBoundaryPair(request);
  await gotoTarget(page);
  const sheet = page.getByRole("dialog", {
    name: actions[0].title,
    exact: true,
  });
  const confirmation = page.getByRole("alertdialog", {
    name: "予算期間の境界を変更しますか？",
    exact: true,
  });

  for (const dismissal of ["cancel", "Escape"] as const) {
    await proposeBoundaryChange(page);
    const cancel = confirmation.getByRole("button", {
      name: "キャンセル",
      exact: true,
    });
    await expect(confirmation).toBeVisible();
    await expect(cancel).toBeFocused();
    if (dismissal === "cancel") await cancel.click();
    else await page.keyboard.press("Escape");

    await expect(confirmation).toBeHidden();
    await expect(sheet).toBeVisible();
    await expect(sheet.getByTestId("current-period-range-start")).toBeFocused();
    await expect(sheet.getByTestId("current-period-range-end")).toHaveValue(
      target.endDate,
    );
    await expect(sheet.getByLabel("期間予算 (円)")).toBeEnabled();
  }
  await assertUnchangedPair(request);
  await sheet.getByRole("button", { name: "閉じる", exact: true }).click();
  await expect(sheet).toBeHidden();
  await expect(
    page.getByRole("button", { name: actions[0].title, exact: true }),
  ).toBeFocused();
});

test("keeps both desktop action forms in inline disclosures", async ({
  page,
  request,
}) => {
  await openDashboard(page, request, 1280);
  for (const action of actions) {
    const trigger = page.getByText(action.title, { exact: true });
    const details = trigger.locator("xpath=ancestor::details");
    await trigger.click();
    await expect(details).toHaveAttribute("open", "");
    await expect(details.getByLabel(action.inputLabel)).toBeVisible();
    await expect(page.getByLabel(action.inputLabel)).toHaveCount(1);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await trigger.click();
    await expect(details.getByLabel(action.inputLabel)).not.toBeVisible();
  }
});
