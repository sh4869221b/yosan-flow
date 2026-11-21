import type { RequestHandler } from "@sveltejs/kit";
import {
  createDayEntrySaveHandler,
  runDayEntrySave,
  type DayEntrySaveDependencies,
} from "../day-entry-save";

export function _createPeriodDayOverwriteHandler(
  dependencies: DayEntrySaveDependencies,
): RequestHandler {
  return createDayEntrySaveHandler("overwrite", dependencies);
}

export const PUT: RequestHandler = (event) =>
  runDayEntrySave("overwrite", event);
