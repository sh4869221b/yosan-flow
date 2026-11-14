import { afterEach, expect, it, vi } from "vitest";
import { pages, request } from "../../scripts/pr-preview-api.ts";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("keeps credentials in authorization headers and unwraps Cloudflare results", async () => {
  vi.stubEnv("CLOUDFLARE_API_TOKEN", "fake-cf-token");
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      Response.json({ success: true, result: { uuid: "fake-id" } }),
    );
  vi.stubGlobal("fetch", fetcher);
  expect(
    await request("/accounts/test/d1/database", "POST", { name: "test" }),
  ).toEqual({ uuid: "fake-id" });
  expect(fetcher).toHaveBeenCalledWith(
    "https://api.cloudflare.com/client/v4/accounts/test/d1/database",
    expect.objectContaining({
      headers: expect.objectContaining({
        Authorization: "Bearer fake-cf-token",
      }),
    }),
  );
});
it("only ignores explicit missing codes, never authentication, quota or server errors", async () => {
  vi.stubEnv("CLOUDFLARE_API_TOKEN", "fake-cf-token");
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  fetcher.mockResolvedValueOnce(
    Response.json(
      { success: false, errors: [{ code: 10025 }] },
      { status: 404 },
    ),
  );
  expect(
    await request("/accounts/test/resource", "GET", undefined, [10025]),
  ).toBeNull();
  for (const status of [401, 403, 429, 500]) {
    fetcher.mockResolvedValueOnce(
      Response.json(
        {
          success: false,
          errors: [{ code: 999, message: "never expose this" }],
        },
        { status },
      ),
    );
    await expect(
      request("/accounts/test/resource", "GET", undefined, [10025]),
    ).rejects.toThrow(`HTTP ${status}`);
  }
});
it("paginates GitHub and Cloudflare without truncating a full page", async () => {
  vi.stubEnv("GH_TOKEN", "fake-github-token");
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ jobs: Array.from({ length: 100 }, (_, id) => ({ id })) }),
    )
    .mockResolvedValueOnce(Response.json({ jobs: [{ id: 100 }] }));
  vi.stubGlobal("fetch", fetcher);
  expect(
    await pages("/repos/test/actions/jobs?filter=latest", "jobs"),
  ).toHaveLength(101);
  expect(fetcher.mock.calls[1][0]).toContain("&per_page=100&page=2");
});
