import type { Page } from "@playwright/test";

export async function openCreateAdvancedSettings(page: Page): Promise<void> {
  const settings = page
    .getByTestId("create-period-panel")
    .locator("details")
    .filter({ has: page.locator("summary", { hasText: "詳細設定（任意）" }) });
  if ((await settings.getAttribute("open")) === null) {
    await settings.locator("summary").click();
  }
}
