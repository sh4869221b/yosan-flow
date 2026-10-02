import { expect, test } from "@playwright/test";

test("issue 472 intentional negative control", () => {
  expect("negative control").toBe("expected failure");
});
