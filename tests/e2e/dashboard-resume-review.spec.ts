import { expect, test, type Page } from "@playwright/test";
import {
  configureDashboardDayEntryE2E,
  openDayEntryAndWaitForHistory,
  saveDayEntrySuccessfully,
  seedCurrentPeriod,
} from "./dashboard-day-entry-helpers";
import { addDays, getBaseUrl, waitForDashboardReady } from "./dashboard-shared";
import { seedPeriod } from "./helpers/db";
import { waitForResponse } from "./period-operation-state-helpers";
import {
  holdDashboardRead as holdNextRead,
  resumeDashboard as resume,
} from "./dashboard-resume-helpers";

configureDashboardDayEntryE2E();

async function refreshOpenDay(page: Page, summaryUrl: string, date: string) {
  const summary = waitForResponse(page, summaryUrl, "GET");
  const history = waitForResponse(
    page,
    `${summaryUrl}/days/${date}/history`,
    "GET",
  );
  await resume(page);
  expect((await summary).ok()).toBe(true);
  expect((await history).ok()).toBe(true);
}

test("moves today's calendar marker and default tab stop together after JST midnight", async ({
  page,
  request,
}) => {
  const { periodId, todayDate } = await seedCurrentPeriod(request);
  const tomorrow = addDays(todayDate, 1);
  const summaryUrl = `${getBaseUrl()}/api/periods/${periodId}`;
  await page.clock.setFixedTime(new Date(`${todayDate}T14:59:59.000Z`));
  await page.goto(`${getBaseUrl()}/?periodId=${periodId}`);
  await waitForDashboardReady(page);
  const oldToday = page.getByTestId(`calendar-day-${todayDate}`);
  const newToday = page.getByTestId(`calendar-day-${tomorrow}`);
  await expect(oldToday).toHaveAttribute("aria-current", "date");
  await expect(oldToday).toHaveAttribute("tabindex", "0");
  await expect(newToday).toHaveAttribute("tabindex", "-1");
  await page.route(summaryUrl, async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({
      response,
      json: {
        ...body,
        dailyRows: body.dailyRows.map((row: { date: string }) => ({
          ...row,
          label: row.date === tomorrow ? "today" : "planned",
        })),
      },
    });
  });
  await page.clock.setFixedTime(new Date(`${todayDate}T15:00:01.000Z`));
  const refreshed = waitForResponse(page, summaryUrl, "GET");
  await resume(page);
  expect((await refreshed).ok()).toBe(true);
  await expect(newToday).toHaveAttribute("aria-current", "date");
  await expect(newToday).toHaveAttribute("tabindex", "0");
  await expect(oldToday).not.toHaveAttribute("aria-current", "date");
  await expect(oldToday).toHaveAttribute("tabindex", "-1");
  await expect(newToday).toHaveAttribute(
    "aria-label",
    `${tomorrow}、今日、0 円`,
  );
  await expect(oldToday).toHaveAttribute(
    "aria-label",
    `${todayDate}、過去、予定、0 円`,
  );
  await expect(
    page.locator('[data-testid^="calendar-day-"][tabindex="0"]'),
  ).toHaveCount(1);
});

for (const operation of ["edit", "delete"] as const) {
  test(`refreshes an open day's total and history after an external ${operation} without losing its draft`, async ({
    page,
    request,
  }) => {
    const { periodId, todayDate } = await seedCurrentPeriod(request);
    const summaryUrl = `${getBaseUrl()}/api/periods/${periodId}`;
    const historyUrl = `${summaryUrl}/days/${todayDate}/history`;
    await page.goto(`${getBaseUrl()}/?periodId=${periodId}`);
    const modal = await openDayEntryAndWaitForHistory({
      page,
      periodId,
      date: todayDate,
    });
    const amount = modal.getByLabel("入力額 (円)");
    await amount.fill("777");
    await modal.getByLabel("メモ").fill("keep this local draft");
    const added = await request.post(`${summaryUrl}/days/${todayDate}/add`, {
      data: { inputYen: 2000, memo: "original external entry" },
    });
    expect(added.ok()).toBe(true);
    await refreshOpenDay(page, summaryUrl, todayDate);
    await expect(modal.locator("li")).toContainText("入力 2000 円");
    const histories = (await (await request.get(historyUrl)).json()) as {
      histories: Array<{ id: string }>;
    };
    const mutationUrl = `${historyUrl}/${histories.histories[0].id}`;
    const changed =
      operation === "edit"
        ? await request.patch(mutationUrl, {
            data: { inputYen: 500, memo: "edited elsewhere" },
          })
        : await request.delete(mutationUrl, {
            headers: { origin: getBaseUrl() },
          });
    expect(changed.ok()).toBe(true);
    await amount.focus();
    await refreshOpenDay(page, summaryUrl, todayDate);
    await expect(page.getByTestId(`used-${todayDate}`)).toHaveText(
      operation === "edit" ? "500 円" : "0 円",
    );
    if (operation === "edit") {
      await expect(modal.locator("li")).toContainText("入力 500 円");
      await expect(modal.locator("li")).toContainText("edited elsewhere");
      await expect(modal).not.toContainText("original external entry");
    } else {
      await expect(modal.locator("li")).toHaveCount(0);
      await expect(modal.getByText("履歴はまだありません。")).toBeVisible();
    }
    await expect(modal).toBeVisible();
    await expect(modal).toContainText(`対象日: ${todayDate}`);
    await expect(amount).toHaveValue("777");
    await expect(amount).toBeFocused();
    await expect(modal.getByLabel("メモ")).toHaveValue("keep this local draft");
    await expect(page.getByTestId("period-select")).toHaveValue(periodId);
  });
}

test("keeps an in-progress history edit and its focused input while refreshing other external entries", async ({
  page,
  request,
}) => {
  const { periodId, todayDate } = await seedCurrentPeriod(request);
  const summaryUrl = `${getBaseUrl()}/api/periods/${periodId}`;
  await page.goto(`${getBaseUrl()}/?periodId=${periodId}`);
  const modal = await openDayEntryAndWaitForHistory({
    page,
    periodId,
    date: todayDate,
  });
  expect(
    (
      await request.post(`${summaryUrl}/days/${todayDate}/add`, {
        data: { inputYen: 2000, memo: "editing this history" },
      })
    ).ok(),
  ).toBe(true);
  await refreshOpenDay(page, summaryUrl, todayDate);
  const edited = modal
    .locator("li")
    .filter({ hasText: "editing this history" });
  await edited.getByRole("button", { name: "編集", exact: true }).click();
  const editingRow = modal.locator("li.editing");
  const amount = editingRow.getByLabel("入力額 (円)");
  await amount.fill("888");
  await editingRow.getByLabel("メモ").fill("unsaved history edit");
  await amount.focus();
  expect(
    (
      await request.post(`${summaryUrl}/days/${todayDate}/add`, {
        data: { inputYen: 500, memo: "added externally during editing" },
      })
    ).ok(),
  ).toBe(true);
  const barrier = await holdNextRead(
    page,
    `${summaryUrl}/days/${todayDate}/history`,
  );
  try {
    await resume(page);
    await barrier.arrived;
    await expect(editingRow).toBeVisible();
    await expect(amount).toHaveValue("888");
    await expect(amount).toBeFocused();
    barrier.release();
    await barrier.finished;
    await expect(page.getByTestId(`used-${todayDate}`)).toHaveText("2500 円");
    await expect(modal.locator("li")).toHaveCount(2);
    await expect(modal).toContainText("added externally during editing");
    await expect(editingRow).toBeVisible();
    await expect(amount).toHaveValue("888");
    await expect(amount).toBeFocused();
    await expect(editingRow.getByLabel("メモ")).toHaveValue(
      "unsaved history edit",
    );
  } finally {
    barrier.release();
    await page.unrouteAll({ behavior: "wait" });
  }
});

test("shows an externally created first period when an empty dashboard resumes", async ({
  page,
  request,
}) => {
  await page.goto(`${getBaseUrl()}/`);
  await waitForDashboardReady(page);
  await expect(
    page.getByRole("heading", { name: "最初の予算期間を作成", exact: true }),
  ).toBeVisible();
  const { periodId, todayDate } = await seedCurrentPeriod(request);
  const list = waitForResponse(page, `${getBaseUrl()}/api/periods`, "GET");
  const summary = waitForResponse(
    page,
    `${getBaseUrl()}/api/periods/${periodId}`,
    "GET",
  );
  await resume(page);
  expect((await list).ok()).toBe(true);
  expect((await summary).ok()).toBe(true);
  await expect(page.getByTestId("period-select")).toHaveValue(periodId);
  await expect(page.getByTestId(`calendar-day-${todayDate}`)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "最初の予算期間を作成", exact: true }),
  ).toBeHidden();
});

test("refreshes externally added periods and changed ranges while retaining the selected period", async ({
  page,
  request,
}) => {
  const { periodId, todayDate } = await seedCurrentPeriod(request);
  const nextPeriodId = `${periodId}-next`;
  const nextDate = addDays(todayDate, 30);
  await seedPeriod(request, getBaseUrl(), {
    periodId: nextPeriodId,
    startDate: nextDate,
    endDate: addDays(todayDate, 59),
    budgetYen: 90000,
  });
  await page.goto(`${getBaseUrl()}/?periodId=${nextPeriodId}`);
  await waitForDashboardReady(page);
  const select = page.getByTestId("period-select");
  await expect(select).toHaveValue(nextPeriodId);
  const thirdPeriodId = `${periodId}-third`;
  await seedPeriod(request, getBaseUrl(), {
    periodId: thirdPeriodId,
    startDate: addDays(todayDate, 60),
    endDate: addDays(todayDate, 89),
    budgetYen: 80000,
  });
  const originalEnd = addDays(todayDate, 27);
  const nextEnd = addDays(todayDate, 58);
  expect(
    (
      await request.put(`${getBaseUrl()}/api/periods/${periodId}`, {
        data: { startDate: todayDate, endDate: originalEnd, budgetYen: 120000 },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await request.put(`${getBaseUrl()}/api/periods/${nextPeriodId}`, {
        data: { startDate: nextDate, endDate: nextEnd, budgetYen: 90000 },
      })
    ).ok(),
  ).toBe(true);
  const refreshed = waitForResponse(
    page,
    `${getBaseUrl()}/api/periods/${nextPeriodId}`,
    "GET",
  );
  await resume(page);
  expect((await refreshed).ok()).toBe(true);
  await expect(select.locator("option")).toHaveCount(3);
  await expect(select).toHaveValue(nextPeriodId);
  await expect(select.locator(`option[value="${periodId}"]`)).toHaveText(
    `${todayDate} - ${originalEnd}`,
  );
  await expect(select.locator(`option[value="${nextPeriodId}"]`)).toHaveText(
    `${nextDate} - ${nextEnd}`,
  );
  await expect(select.locator(`option[value="${thirdPeriodId}"]`)).toHaveCount(
    1,
  );
  await expect(page.getByTestId(`calendar-day-${nextEnd}`)).toBeVisible();
  await expect(
    page.getByTestId(`calendar-day-${addDays(todayDate, 59)}`),
  ).toHaveCount(0);
  await expect(page).toHaveURL(`${getBaseUrl()}/?periodId=${nextPeriodId}`);
});

test("a delayed resume period list cannot switch back from a newly selected period", async ({
  page,
  request,
}) => {
  const { periodId, todayDate } = await seedCurrentPeriod(request);
  const nextPeriodId = `${periodId}-next`;
  const nextDate = addDays(todayDate, 30);
  await seedPeriod(request, getBaseUrl(), {
    periodId: nextPeriodId,
    startDate: nextDate,
    endDate: addDays(todayDate, 59),
    budgetYen: 90000,
    dailyTotals: [{ date: nextDate, totalUsedYen: 6000 }],
  });
  await page.goto(`${getBaseUrl()}/?periodId=${periodId}`);
  await waitForDashboardReady(page);
  const barrier = await holdNextRead(page, `${getBaseUrl()}/api/periods`);
  try {
    await resume(page);
    await barrier.arrived;
    const selected = waitForResponse(
      page,
      `${getBaseUrl()}/api/periods/${nextPeriodId}`,
      "GET",
    );
    await page.getByTestId("period-select").selectOption(nextPeriodId);
    expect((await selected).ok()).toBe(true);
    await expect(page.getByTestId(`used-${nextDate}`)).toHaveText("6000 円");
    barrier.release();
    await barrier.finished;
    await expect(page.getByTestId("period-select")).toHaveValue(nextPeriodId);
    await expect(page.getByTestId(`used-${nextDate}`)).toHaveText("6000 円");
    await expect(page.getByTestId(`calendar-day-${todayDate}`)).toHaveCount(0);
  } finally {
    barrier.release();
    await page.unrouteAll({ behavior: "wait" });
  }
});

test("a delayed resume history cannot replace the history of a subsequent save and reopened modal", async ({
  page,
  request,
}) => {
  const { periodId, todayDate } = await seedCurrentPeriod(request);
  const summaryUrl = `${getBaseUrl()}/api/periods/${periodId}`;
  const historyUrl = `${summaryUrl}/days/${todayDate}/history`;
  await page.goto(`${getBaseUrl()}/?periodId=${periodId}`);
  const modal = await openDayEntryAndWaitForHistory({
    page,
    periodId,
    date: todayDate,
  });
  const barrier = await holdNextRead(page, historyUrl);
  try {
    await resume(page);
    await barrier.arrived;
    await modal.getByLabel("入力額 (円)").fill("2000");
    await modal.getByLabel("メモ").fill("save after resume started");
    await saveDayEntrySuccessfully({ page, modal, periodId, date: todayDate });
    const reopened = waitForResponse(page, historyUrl, "GET");
    await page.getByTestId(`calendar-day-${todayDate}`).click();
    expect((await reopened).ok()).toBe(true);
    await expect(modal.locator("li")).toContainText(
      "save after resume started",
    );
    const amount = modal.getByLabel("入力額 (円)");
    await amount.fill("999");
    await amount.focus();
    barrier.release();
    await barrier.finished;
    await expect(modal.locator("li")).toHaveCount(1);
    await expect(modal.locator("li")).toContainText("入力 2000 円");
    await expect(modal.locator("li")).toContainText(
      "save after resume started",
    );
    await expect(page.getByTestId(`used-${todayDate}`)).toHaveText("2000 円");
    await expect(amount).toHaveValue("999");
    await expect(amount).toBeFocused();
  } finally {
    barrier.release();
    await page.unrouteAll({ behavior: "wait" });
  }
});

test("a delayed resume history cannot reopen or change a modal closed and reopened for another date", async ({
  page,
  request,
}) => {
  const { periodId, todayDate } = await seedCurrentPeriod(request);
  const otherDate = addDays(todayDate, 2);
  const summaryUrl = `${getBaseUrl()}/api/periods/${periodId}`;
  await page.goto(`${getBaseUrl()}/?periodId=${periodId}`);
  const modal = await openDayEntryAndWaitForHistory({
    page,
    periodId,
    date: todayDate,
  });
  expect(
    (
      await request.post(`${summaryUrl}/days/${todayDate}/add`, {
        data: { inputYen: 2000, memo: "belongs to the closed date" },
      })
    ).ok(),
  ).toBe(true);
  const barrier = await holdNextRead(
    page,
    `${summaryUrl}/days/${todayDate}/history`,
  );
  try {
    await resume(page);
    await barrier.arrived;
    await modal.getByRole("button", { name: "閉じる", exact: true }).click();
    await expect(modal).toBeHidden();
    await openDayEntryAndWaitForHistory({ page, periodId, date: otherDate });
    const amount = modal.getByLabel("入力額 (円)");
    await amount.fill("777");
    await amount.focus();
    barrier.release();
    await barrier.finished;
    await expect(modal).toContainText(`対象日: ${otherDate}`);
    await expect(modal.locator("li")).toHaveCount(0);
    await expect(modal).not.toContainText("belongs to the closed date");
    await expect(amount).toHaveValue("777");
    await expect(amount).toBeFocused();
    await expect(page.getByTestId(`used-${otherDate}`)).toHaveText("0 円");
  } finally {
    barrier.release();
    await page.unrouteAll({ behavior: "wait" });
  }
});

for (const operation of ["edit", "delete confirmation"] as const) {
  test(`recovers history actions when an external deletion removes the row under ${operation}`, async ({
    page,
    request,
  }) => {
    const { periodId, todayDate } = await seedCurrentPeriod(request);
    const summaryUrl = `${getBaseUrl()}/api/periods/${periodId}`;
    const historyUrl = `${summaryUrl}/days/${todayDate}/history`;
    await page.goto(`${getBaseUrl()}/?periodId=${periodId}`);
    const modal = await openDayEntryAndWaitForHistory({
      page,
      periodId,
      date: todayDate,
    });
    for (const entry of [
      { inputYen: 2000, memo: "externally removed history" },
      { inputYen: 500, memo: "remaining editable history" },
    ]) {
      expect(
        (
          await request.post(`${summaryUrl}/days/${todayDate}/add`, {
            data: entry,
          })
        ).ok(),
      ).toBe(true);
    }
    await refreshOpenDay(page, summaryUrl, todayDate);
    await expect(modal.locator("li")).toHaveCount(2);
    const targetRow = modal.locator("li").filter({
      hasText: "externally removed history",
    });
    const dayAmount = modal.getByLabel("入力額 (円)", { exact: true }).first();
    if (operation === "edit") {
      await targetRow
        .getByRole("button", { name: "編集", exact: true })
        .click();
      const editingRow = modal.locator("li.editing");
      await editingRow.getByLabel("入力額 (円)").fill("777");
      await editingRow.getByLabel("メモ").fill("keep the deleted row draft");
      await editingRow.getByLabel("入力額 (円)").focus();
    } else {
      await targetRow
        .getByRole("button", { name: "削除", exact: true })
        .click();
      await expect(
        targetRow.getByRole("button", { name: "削除を確定", exact: true }),
      ).toBeVisible();
      await dayAmount.fill("444");
      await dayAmount.focus();
    }
    const body = (await (await request.get(historyUrl)).json()) as {
      histories: Array<{ id: string; memo: string }>;
    };
    const deletedHistory = body.histories.find(
      (history) => history.memo === "externally removed history",
    );
    expect(deletedHistory).toBeDefined();
    expect(
      (
        await request.delete(`${historyUrl}/${deletedHistory?.id}`, {
          headers: { origin: getBaseUrl() },
        })
      ).ok(),
    ).toBe(true);
    await refreshOpenDay(page, summaryUrl, todayDate);
    await expect(page.getByTestId(`used-${todayDate}`)).toHaveText("500 円");
    await expect(modal.locator("li")).toHaveCount(1);
    const notice = modal.getByRole("heading", {
      name:
        operation === "edit"
          ? "編集中の履歴は削除されました"
          : "削除を確認していた履歴は削除されました",
      exact: true,
    });
    await expect(notice).toBeVisible();
    if (operation === "edit") {
      const amount = modal.getByLabel("編集中の入力額 (円)", { exact: true });
      const memo = modal.getByLabel("編集中のメモ", { exact: true });
      await expect(amount).toHaveValue("777");
      await expect(amount).toHaveAttribute("readonly", "");
      await expect(memo).toHaveValue("keep the deleted row draft");
      await expect(memo).toHaveAttribute("readonly", "");
      await expect(notice).toBeFocused();
    } else {
      await expect(dayAmount).toHaveValue("444");
      await expect(dayAmount).toBeFocused();
      await expect(notice).not.toBeFocused();
    }
    await modal
      .getByRole("button", {
        name: operation === "edit" ? "編集を終了" : "削除確認を終了",
        exact: true,
      })
      .click();
    await expect(notice).toBeHidden();
    await expect(
      modal.getByRole("heading", { name: "履歴表示", exact: true }),
    ).toBeFocused();
    const remainingRow = modal.locator("li").filter({
      hasText: "remaining editable history",
    });
    await expect(remainingRow).toContainText("入力 500 円");
    await expect(
      remainingRow.getByRole("button", { name: "編集", exact: true }),
    ).toBeEnabled();
    await expect(
      remainingRow.getByRole("button", { name: "削除", exact: true }),
    ).toBeEnabled();
    await remainingRow
      .getByRole("button", { name: "編集", exact: true })
      .click();
    await expect(
      modal.locator("li.editing").getByLabel("入力額 (円)"),
    ).toHaveValue("500");
    await modal
      .locator("li.editing")
      .getByRole("button", { name: "キャンセル", exact: true })
      .click();
    await remainingRow
      .getByRole("button", { name: "削除", exact: true })
      .click();
    await expect(
      remainingRow.getByRole("button", { name: "削除を確定", exact: true }),
    ).toBeVisible();
  });
}
