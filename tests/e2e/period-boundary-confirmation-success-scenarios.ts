import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import {
  getBaseUrl,
  resetTestData,
  waitForDashboardReady,
} from "./dashboard-shared";
import {
  applyRange,
  assertExactDialog,
  assertSelectedBoundary,
  assertUnchangedPair,
  assertUpdatedPair,
  gotoTarget,
  proposeBoundaryChange,
  readPeriodList,
  seedBoundaryPair,
  target,
} from "./period-boundary-confirmation-helpers";

test("fits and scrolls the boundary sheet across viewport sizes", async ({
  page,
  request,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedBoundaryPair(request);
  await gotoTarget(page);
  await proposeBoundaryChange(page);
  const dialog = page.getByRole("alertdialog");
  const cancel = dialog.getByRole("button", { name: "キャンセル" });
  const confirm = dialog.getByRole("button", { name: "変更する" });
  await expect(cancel).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath("boundary-390.png") });

  for (const width of [375, 760, 761, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    const bounds = await dialog.boundingBox();
    expect(bounds).not.toBeNull();
    if (!bounds) throw new Error("Missing boundary sheet");
    if (width <= 760) {
      expect(bounds.x).toBeCloseTo(0, 0);
      expect(bounds.width).toBeCloseTo(width, 0);
      expect(bounds.y + bounds.height).toBeCloseTo(844, 0);
    } else {
      expect(bounds.x + bounds.width / 2).toBeCloseTo(width / 2, 0);
      expect(bounds.y + bounds.height / 2).toBeCloseTo(422, 0);
    }
  }

  await page.setViewportSize({ width: 320, height: 568 });
  expect(
    await dialog.evaluate(
      (element) => element.scrollHeight > element.clientHeight,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <= innerWidth &&
        document.body.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  const title = dialog.getByRole("heading", {
    name: "予算期間の境界を変更しますか？",
  });
  const changes = dialog.getByText("前の期間（編集中）", { exact: true });
  for (const element of [cancel, title, changes, confirm]) {
    await element.scrollIntoViewIfNeeded();
    const within = await element.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      const sheet = node
        .closest('[role="alertdialog"]')!
        .getBoundingClientRect();
      return (
        rect.top >= sheet.top &&
        rect.bottom <= sheet.bottom &&
        rect.left >= 0 &&
        rect.right <= innerWidth
      );
    });
    expect(within).toBe(true);
  }
  const buttons = await Promise.all([
    cancel.boundingBox(),
    confirm.boundingBox(),
  ]);
  expect(buttons[0]!.width).toBeCloseTo(buttons[1]!.width, 0);
  expect(buttons[0]!.height).toBeGreaterThanOrEqual(48);
  expect(buttons[1]!.height).toBeGreaterThanOrEqual(48);
  expect(buttons[0]!.y).toBeLessThan(buttons[1]!.y);
  await page.screenshot({
    path: testInfo.outputPath("boundary-320-bottom.png"),
  });
  await cancel.click();
  await expect(dialog).toHaveCount(0);
  await assertUnchangedPair(request);
  await proposeBoundaryChange(page);
  await confirm.click();
  await expect(dialog).toHaveCount(0);
  await assertUpdatedPair(request);
});

test("shows an accessible boundary confirmation and cancels without writing", async ({
  page,
  request,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await seedBoundaryPair(request);
  let confirmPutCount = 0;
  page.on("request", (outgoingRequest) => {
    if (outgoingRequest.method() !== "PUT") return;
    const body: unknown = outgoingRequest.postDataJSON();
    if (
      typeof body === "object" &&
      body != null &&
      "confirmation" in body &&
      body.confirmation != null
    ) {
      confirmPutCount += 1;
    }
  });

  await gotoTarget(page);
  await proposeBoundaryChange(page);
  const dialog = page.getByRole("alertdialog");
  await assertExactDialog(page);

  const cancelButton = dialog.getByRole("button", { name: "キャンセル" });
  const actionButton = dialog.getByRole("button", { name: "変更する" });
  await expect(cancelButton).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(actionButton).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(cancelButton).toBeFocused();
  await expect(page.getByTestId("current-period-range-start")).toBeDisabled();
  await expect(page.getByTestId("current-period-range-end")).toBeDisabled();
  await expect(page.getByTestId("current-period-range-apply")).toBeDisabled();
  await expect(page.getByTestId("current-period-range-apply")).toHaveText(
    "期間を反映",
  );
  await expect(page.getByLabel("期間予算 (円)")).toBeDisabled();
  await expect(page.getByRole("button", { name: "期間を更新" })).toBeDisabled();
  await expect(page.getByTestId("period-select")).toBeDisabled();

  await page.screenshot({
    path: testInfo.outputPath("desktop.png"),
  });
  await cancelButton.click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId("current-period-range-start")).toBeFocused();
  await expect(page.getByTestId("current-period-range-start")).toHaveValue(
    target.startDate,
  );
  await expect(page.getByTestId("current-period-range-end")).toHaveValue(
    target.endDate,
  );
  const calendar = page.locator("[data-range-calendar-root]").first();
  await calendar.getByRole("button", { name: "次の月" }).click();
  await expect(
    calendar.locator('[data-range-calendar-day][data-value="2026-07-20"]'),
  ).toHaveAttribute("data-selected", "");
  await expect(
    calendar.locator('[data-range-calendar-day][data-value="2026-07-21"]'),
  ).not.toHaveAttribute("data-selected", "");
  if (process.env.YOSAN_FLOW_EVIDENCE_DIR) {
    await page.screenshot({
      path: `${process.env.YOSAN_FLOW_EVIDENCE_DIR}/task-4-boundary-cancel-reset.png`,
      fullPage: true,
    });
  }

  await proposeBoundaryChange(page);
  await expect(dialog).toHaveCount(1);
  await expect(cancelButton).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId("current-period-range-start")).toBeFocused();
  await expect(page.getByTestId("current-period-range-end")).toHaveValue(
    target.endDate,
  );
  expect(confirmPutCount).toBe(0);

  const cancelledPair = await assertUnchangedPair(request);
  await writeFile(
    testInfo.outputPath("api.json"),
    `${JSON.stringify(cancelledPair, null, 2)}\n`,
  );
});

test.describe("stale confirmation, no-dialog cases, and double submit", () => {
  test("confirms one linked boundary update on desktop and mobile", async ({
    page,
    request,
  }, testInfo) => {
    const actions: Array<Record<string, unknown>> = [];
    const apiStates: Record<string, unknown> = {};

    await page.setViewportSize({ width: 1280, height: 720 });
    await seedBoundaryPair(request);
    await gotoTarget(page);
    await proposeBoundaryChange(page);
    await assertExactDialog(page);
    await page.screenshot({
      path: testInfo.outputPath("desktop-proposal.png"),
    });

    const releaseConfirm = Promise.withResolvers<void>();
    const confirmArrived = Promise.withResolvers<void>();
    let confirmPutCount = 0;
    await page.route(`**/api/periods/${target.periodId}`, async (route) => {
      if (
        route.request().method() === "PUT" &&
        route.request().postDataJSON().confirmation != null
      ) {
        confirmPutCount += 1;
        confirmArrived.resolve();
        await releaseConfirm.promise;
      }
      await route.continue();
    });

    const action = page
      .getByRole("alertdialog")
      .getByRole("button", { name: "変更する" });
    await action.evaluate((button) => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await confirmArrived.promise;
    expect(confirmPutCount).toBe(1);
    await expect(page.getByRole("alertdialog")).toHaveCount(1);
    await expect(
      page.getByRole("alertdialog").getByRole("button", { name: "変更中..." }),
    ).toBeDisabled();
    await expect(
      page.getByRole("alertdialog").getByRole("button", { name: "キャンセル" }),
    ).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("alertdialog")).toHaveCount(1);
    expect(confirmPutCount).toBe(1);
    actions.push({
      phase: "desktop-blocked",
      confirmPutCount,
      disabled: true,
    });
    releaseConfirm.resolve();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    expect(confirmPutCount).toBe(1);
    await expect(page.locator("#range-settings-heading")).toBeFocused();

    const desktopPair = await assertUpdatedPair(request);
    const desktopList = await readPeriodList(request);
    expect(desktopList).toEqual(
      expect.arrayContaining([
        expect.objectContaining(desktopPair.target),
        expect.objectContaining(desktopPair.successor),
      ]),
    );
    await expect(page.getByTestId("current-period-range-end")).toHaveValue(
      "2026-07-21",
    );
    await expect(page.getByText("期間: 2026-06-21 - 2026-07-21")).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("desktop.png"),
    });
    apiStates.desktop = { ...desktopPair, list: desktopList };
    actions.push({ phase: "desktop-complete", confirmPutCount });

    await resetTestData(request);
    await seedBoundaryPair(request);
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoTarget(page);
    await proposeBoundaryChange(page);
    await assertExactDialog(page);
    const dialog = page.getByRole("alertdialog");
    await expect(
      dialog.getByRole("button", { name: "キャンセル" }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "変更する" }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
    await page.screenshot({
      path: testInfo.outputPath("mobile-proposal.png"),
    });
    await dialog.getByRole("button", { name: "変更する" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator("#range-settings-heading")).toBeFocused();
    const mobilePair = await assertUpdatedPair(request);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
    await page.screenshot({
      path: testInfo.outputPath("mobile.png"),
    });
    apiStates.mobile = mobilePair;
    actions.push({ phase: "mobile-complete", horizontalOverflow: false });

    await writeFile(
      testInfo.outputPath("api.json"),
      `${JSON.stringify(apiStates, null, 2)}\n`,
    );
    await writeFile(
      testInfo.outputPath("actions.json"),
      `${JSON.stringify(actions, null, 2)}\n`,
    );
  });
});

for (const scenario of [
  {
    name: "shortens the previous period",
    edited: target.periodId,
    range: { endDate: "2026-07-19" },
    previousEnd: "2026-07-19",
    nextStart: "2026-07-20",
    editedLabel: "前の期間（編集中）",
  },
  {
    name: "advances the next period",
    edited: "boundary-successor",
    range: { startDate: "2026-07-20" },
    previousEnd: "2026-07-19",
    nextStart: "2026-07-20",
    editedLabel: "後の期間（編集中）",
  },
] as const) {
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 390, height: 844 },
  ]) {
    test(`${scenario.name} with confirmation at ${viewport.width}px`, async ({
      page,
      request,
    }) => {
      await page.setViewportSize(viewport);
      await seedBoundaryPair(request);
      await page.goto(`${getBaseUrl()}/?periodId=${scenario.edited}`);
      await waitForDashboardReady(page);
      await applyRange(page, scenario.range);
      const dialog = page.getByRole("alertdialog");
      await expect(dialog).toContainText(scenario.editedLabel);
      await expect(dialog).toContainText("2026-06-21 ～ 2026-07-20");
      await expect(dialog).toContainText("2026-06-21 ～ 2026-07-19");
      await expect(dialog).toContainText("2026-07-21 ～ 2026-08-19");
      await expect(dialog).toContainText("2026-07-20 ～ 2026-08-19");
      await dialog.getByRole("button", { name: "変更する" }).click();
      await expect(dialog).toHaveCount(0);
      await assertSelectedBoundary(
        page,
        request,
        scenario.edited,
        scenario.previousEnd,
        scenario.nextStart,
      );
      await page.reload();
      await waitForDashboardReady(page);
      await assertSelectedBoundary(
        page,
        request,
        scenario.edited,
        scenario.previousEnd,
        scenario.nextStart,
      );
    });
  }
}
