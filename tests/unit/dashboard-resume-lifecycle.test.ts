import { expect, it, vi } from "vitest";
import { observeDashboardResume } from "#lib/dashboard/dashboard-resume.ts";

function createBrowser(wasDiscarded = false) {
  const document = Object.assign(new EventTarget(), {
    visibilityState: "visible" as DocumentVisibilityState,
    wasDiscarded,
  });
  const window = Object.assign(new EventTarget(), {
    navigator: { onLine: true },
  });
  const refresh = vi.fn();
  const dispose = observeDashboardResume(document, window, refresh);
  return { document, window, refresh, dispose };
}

it("refreshes visible returns, restored pages and connectivity recovery", () => {
  const { document, window, refresh, dispose } = createBrowser();
  expect(refresh).not.toHaveBeenCalled();
  document.visibilityState = "hidden";
  document.dispatchEvent(new Event("visibilitychange"));
  window.dispatchEvent(new Event("online"));
  expect(refresh).not.toHaveBeenCalled();

  document.visibilityState = "visible";
  document.dispatchEvent(new Event("visibilitychange"));
  expect(refresh).toHaveBeenLastCalledWith(true);
  window.dispatchEvent(new Event("pageshow"));
  expect(refresh).toHaveBeenCalledTimes(1);
  window.dispatchEvent(
    Object.assign(new Event("pageshow"), { persisted: true }),
  );
  expect(refresh).toHaveBeenLastCalledWith(false);
  window.dispatchEvent(new Event("online"));
  expect(refresh).toHaveBeenCalledTimes(3);
  expect(refresh).toHaveBeenLastCalledWith(true);

  window.navigator.onLine = false;
  document.dispatchEvent(new Event("visibilitychange"));
  expect(refresh).toHaveBeenCalledTimes(3);
  window.navigator.onLine = true;
  window.dispatchEvent(new Event("online"));
  expect(refresh).toHaveBeenCalledTimes(4);
  dispose();
});

it("marks connectivity recovery for follow-up after earlier resume signals", () => {
  const { document, window, refresh, dispose } = createBrowser();
  document.dispatchEvent(new Event("visibilitychange"));
  expect(refresh).toHaveBeenLastCalledWith(false);
  window.dispatchEvent(
    Object.assign(new Event("pageshow"), { persisted: true }),
  );
  expect(refresh).toHaveBeenLastCalledWith(false);
  window.navigator.onLine = false;
  window.navigator.onLine = true;
  window.dispatchEvent(new Event("online"));
  expect(refresh).toHaveBeenCalledTimes(3);
  expect(refresh).toHaveBeenLastCalledWith(true);
  dispose();
});

it("refreshes discarded documents and removes every listener on cleanup", () => {
  const { document, window, refresh, dispose } = createBrowser(true);
  expect(refresh).toHaveBeenCalledOnce();
  dispose();
  document.dispatchEvent(new Event("visibilitychange"));
  window.dispatchEvent(
    Object.assign(new Event("pageshow"), { persisted: true }),
  );
  window.dispatchEvent(new Event("online"));
  expect(refresh).toHaveBeenCalledOnce();
});
