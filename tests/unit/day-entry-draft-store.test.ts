import { describe, expect, it } from "vitest";
import { createDayEntryDraftStore } from "../../src/lib/dashboard/day-entry-draft-store.ts";

describe("day entry drafts", () => {
  it("isolates raw values by period and date", () => {
    const store = createDayEntryDraftStore();
    store.write("a", "2026-11-04", "1e3", "未送信");
    expect(store.read("a", "2026-11-04")).toMatchObject({
      inputYen: "1e3",
      memo: "未送信",
    });
    expect(store.read("b", "2026-11-04")).toBeUndefined();
    expect(store.read("a", "2026-11-05")).toBeUndefined();
  });
  it("clears only the submitted revision and retains newer edits even with equal values", () => {
    const store = createDayEntryDraftStore();
    store.write("a", "day", "800", "昼食");
    const submitted = store.read("a", "day");
    store.write("a", "day", "800", "昼食");
    store.clearSubmitted("a", "day", submitted);
    expect(store.read("a", "day")).toBeDefined();
    store.clearSubmitted("a", "day", store.read("a", "day"));
    expect(store.read("a", "day")).toBeUndefined();
  });
  it("does not retain empty drafts or clear another date", () => {
    const store = createDayEntryDraftStore();
    store.write("a", "one", "0", "");
    store.write("a", "two", "7", "");
    store.clearSubmitted("a", "two", store.read("a", "one"));
    expect(store.read("a", "two")?.inputYen).toBe("7");
    store.write("a", "one", "", "");
    expect(store.read("a", "one")).toBeUndefined();
  });
});
