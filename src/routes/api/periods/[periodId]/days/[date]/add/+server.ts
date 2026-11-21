import type { RequestHandler } from "@sveltejs/kit";
import {
  createDayEntrySaveHandler,
  runDayEntrySave,
  type DayEntrySaveDependencies,
} from "../day-entry-save";

export function _createPeriodDayAddHandler(
  dependencies: DayEntrySaveDependencies,
): RequestHandler {
  return createDayEntrySaveHandler("add", dependencies);
}

export const POST: RequestHandler = (event) => runDayEntrySave("add", event);
