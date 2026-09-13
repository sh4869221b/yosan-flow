import { describe, expect, it } from "vitest";
import { normalizeRoute } from "$lib/server/observability/route";

describe("telemetry route normalization", () => {
  it.each([
    ["/api/periods", "/api/periods"],
    ["/api/periods/secret-period", "/api/periods/[periodId]"],
    [
      "/api/periods/secret-period/days/2026-09-13/add",
      "/api/periods/[periodId]/days/[date]/add",
    ],
    [
      "/api/periods/secret-period/days/2026-09-13/overwrite",
      "/api/periods/[periodId]/days/[date]/overwrite",
    ],
    [
      "/api/periods/secret-period/days/2026-09-13/history",
      "/api/periods/[periodId]/days/[date]/history",
    ],
    [
      "/api/periods/secret-period/days/2026-09-13/history/secret-history",
      "/api/periods/[periodId]/days/[date]/history/[historyId]",
    ],
  ])(
    "normalizes %s including one trailing slash and suffixes",
    (path, template) => {
      expect(normalizeRoute(path)).toBe(template);
      expect(normalizeRoute(`${path}/`)).toBe(template);
      expect(
        normalizeRoute(`${path}/?token=secret-query#secret-fragment`),
      ).toBe(template);
      expect(normalizeRoute(`${path}#secret-fragment?token=secret-query`)).toBe(
        template,
      );
    },
  );

  it("matches dynamic segments without decoding or validating domain input", () => {
    expect(normalizeRoute("/api/periods/%2Fsecret/days/not-a-date/add")).toBe(
      "/api/periods/[periodId]/days/[date]/add",
    );
  });

  it.each([
    "/secret-path?token=secret-query",
    "/api/periods//days/2026-09-13/add",
    "/api/periods/secret-period/days//add",
    "/api/periods/secret-period/days/2026-09-13/history/secret-history/extra",
    "/api/periods/secret-period/extra",
    "/api/periods//",
    "/api/periods/secret-period//",
    "/api/__test/reset",
    "https://example.com/api/periods/secret-period",
    "",
  ])("returns only unknown for unsupported path %s", (path) => {
    expect(normalizeRoute(path)).toBe("unknown");
  });
});
