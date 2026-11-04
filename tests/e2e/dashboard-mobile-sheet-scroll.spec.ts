import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  addDays,
  getBaseUrl,
  resetTestData,
  waitForDashboardReady,
} from "./dashboard-shared";
import { seedPeriod } from "./helpers/db";

// Use touch input as well as a narrow viewport: click() can hide mobile-only
// hit-testing failures by waiting for and scrolling the target before clicking.
test.use({
  viewport: { width: 375, height: 667 },
  isMobile: true,
  hasTouch: true,
});
test.describe.configure({ timeout: 120_000 });
test.beforeEach(async ({ request }) => {
  await resetTestData(request);
  await seedPeriod(request, getBaseUrl(), {
    periodId: "p-touch-scroll",
    startDate: "2026-04-10",
    endDate: addDays("2026-04-10", 29),
    budgetYen: 120000,
  });
});

const actions = [
  {
    title: "次の予算期間を作成する",
    input: "新規予算額 (円)",
  },
  {
    title: "期間の日付や予算を変更する",
    input: "期間予算 (円)",
  },
] as const;

async function tapVisible(page: Page, target: Locator): Promise<void> {
  // Do not let locator.tap() bring an obscured/offscreen control into view.
  await expect(target).toBeInViewport();
  const bounds = await target.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.y + bounds!.height / 2).toBeLessThan(
    page.viewportSize()!.height,
  );
  await page.touchscreen.tap(
    bounds!.x + bounds!.width / 2,
    bounds!.y + bounds!.height / 2,
  );
}

for (const height of [667, 812]) {
  test(`touch opens and reopens both sheets at the bottom of a ${height}px viewport`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height });
    await page.goto(`${getBaseUrl()}/?periodId=p-touch-scroll`);
    await waitForDashboardReady(page);
    await page.evaluate(() => document.fonts.ready);
    const writes: string[] = [];
    page.on("request", (outgoing) => {
      if (["POST", "PUT", "PATCH", "DELETE"].includes(outgoing.method()))
        writes.push(outgoing.url());
    });

    for (const action of actions) {
      const trigger = page.getByRole("button", {
        name: action.title,
        exact: true,
      });
      const sheet = page.getByRole("dialog", {
        name: action.title,
        exact: true,
      });
      await page.evaluate(() =>
        window.scrollTo(0, document.documentElement.scrollHeight),
      );
      const bottom = await page.evaluate(() => window.scrollY);
      expect(bottom).toBeGreaterThan(0);
      await tapVisible(page, trigger);
      await expect(sheet).toBeVisible();
      await expect(
        sheet.getByRole("heading", { name: action.title }),
      ).toBeFocused();
      await sheet.getByLabel(action.input).fill("130000");
      await sheet.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      await sheet.evaluate((element) => {
        element.scrollTop = 0;
      });
      await tapVisible(
        page,
        sheet.getByRole("button", { name: "閉じる", exact: true }),
      );
      await expect(sheet).toBeHidden();
      await expect(trigger).toBeFocused();
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(bottom);

      // Reopen without scrolling or resetting body/overlay state after closing.
      await tapVisible(page, trigger);
      await expect(sheet.getByLabel(action.input)).toHaveValue("130000");
      await page.keyboard.press("Escape");
      await expect(sheet).toBeHidden();
      await expect(trigger).toBeFocused();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect
        .poll(() =>
          page.evaluate(() => getComputedStyle(document.body).pointerEvents),
        )
        .toBe("auto");
      await page.evaluate(() => window.scrollBy(0, -100));
      await expect
        .poll(() => page.evaluate(() => window.scrollY))
        .toBeLessThan(bottom);
    }
    expect(writes).toEqual([]);
  });
}

test("a touch swipe across the create trigger scrolls, and the next tap opens the sheet", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Native touch drags use Chromium CDP");
  await page.goto(`${getBaseUrl()}/?periodId=p-touch-scroll`);
  await waitForDashboardReady(page);
  const trigger = page.getByRole("button", {
    name: actions[0].title,
    exact: true,
  });
  const sheet = page.getByRole("dialog", {
    name: actions[0].title,
    exact: true,
  });
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  );
  const bottom = await page.evaluate(() => window.scrollY);
  const bounds = await trigger.boundingBox();
  expect(bounds).not.toBeNull();
  const x = bounds!.x + bounds!.width / 2;
  const y = bounds!.y + bounds!.height / 2;
  const session = await page.context().newCDPSession(page);
  try {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y }],
    });
    // Drag down from the trigger, so the page moves upward. A real scroll
    // cancels the pointer and must not accidentally activate the sheet.
    for (let distance = 10; distance <= 40; distance += 10) {
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x, y: y + distance }],
      });
      await page.evaluate(() => new Promise(requestAnimationFrame));
    }
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect(sheet).toBeHidden();
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeLessThan(bottom);
    await tapVisible(page, trigger);
    await expect(sheet).toBeVisible();
    await tapVisible(
      page,
      sheet.getByRole("button", { name: "閉じる", exact: true }),
    );
    await expect(sheet).toBeHidden();
    await tapVisible(page, trigger);
    await expect(sheet).toBeVisible();
  } finally {
    await session.detach();
  }
});
