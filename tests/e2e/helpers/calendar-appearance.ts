import { expect, type Locator } from "@playwright/test";

export async function expectVisibleCalendarFocus(
  day: Locator,
  color: string,
): Promise<void> {
  await expect(day).toBeFocused();
  await expect(day).toHaveCSS("outline-style", "solid");
  await expect(day).toHaveCSS("outline-color", color);
  await expect
    .poll(() =>
      day.evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).outlineWidth),
      ),
    )
    .toBeGreaterThan(0);
}

export async function expectCalendarDayFitsCell(day: Locator): Promise<void> {
  const overflow = await day.evaluate((element) => {
    const cell = element.closest("td");
    if (!cell) throw new Error("Calendar day must be inside a table cell");
    const bounds = element.getBoundingClientRect();
    const cellBounds = cell.getBoundingClientRect();
    return Math.max(
      cellBounds.left - bounds.left,
      bounds.right - cellBounds.right,
      cellBounds.top - bounds.top,
      bounds.bottom - cellBounds.bottom,
    );
  });
  // Allow subpixel table rounding, but not clipped padding or borders.
  expect(overflow).toBeLessThanOrEqual(1);
}
