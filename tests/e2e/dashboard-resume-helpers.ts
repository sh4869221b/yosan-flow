import type { Page } from "@playwright/test";

export async function resumeDashboard(
  page: Page,
  event: "visibilitychange" | "pageshow" | "online" = "visibilitychange",
): Promise<void> {
  await page.evaluate((event) => {
    if (event === "visibilitychange") {
      document.dispatchEvent(new Event(event));
    } else if (event === "pageshow") {
      window.dispatchEvent(new PageTransitionEvent(event, { persisted: true }));
    } else {
      window.dispatchEvent(new Event(event));
    }
  }, event);
}

export async function holdDashboardRead(page: Page, url: string) {
  const arrived = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const finished = Promise.withResolvers<void>();
  let captured = false;
  await page.route(url, async (route) => {
    if (route.request().method() !== "GET" || captured) {
      await route.fallback();
      return;
    }
    captured = true;
    const response = await route.fetch();
    arrived.resolve();
    await release.promise;
    const delivered = page.waitForResponse(
      (candidate) => candidate.request() === route.request(),
    );
    await route.fulfill({ response });
    await (await delivered).finished();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    );
    finished.resolve();
  });
  return {
    arrived: arrived.promise,
    release: release.resolve,
    finished: finished.promise,
  };
}
