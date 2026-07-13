import { expect, it } from "vitest";
import { createPeriodSummaryRequestTracker } from "$lib/dashboard/period-summary-request-tracker";
import { createPeriodSummaryRevision } from "$lib/dashboard/period-summary-revision";

it("does not promote a request started during a mutation to fresh", () => {
  const revision = createPeriodSummaryRevision();
  const tracker = createPeriodSummaryRequestTracker(revision);
  const mutation = revision.beginMutation("period-1");

  const request = tracker.start("period-1");
  revision.completeMutation("period-1", mutation);

  expect(tracker.owns(request)).toBe(true);
  expect(tracker.isFresh(request)).toBe(false);
});

it("keeps an idle request fresh while its ownership is current", () => {
  const revision = createPeriodSummaryRevision();
  const tracker = createPeriodSummaryRequestTracker(revision);

  const request = tracker.start("period-1");

  expect(tracker.owns(request)).toBe(true);
  expect(tracker.isFresh(request)).toBe(true);
});
