import {
  createInMemoryApiServices,
  type InMemoryApiServices,
} from "$lib/server/services/month-summary-service";
import {
  _createPeriodsHandler,
  _createPeriodsListHandler,
} from "../../../src/routes/api/periods/+server";
import {
  _createPeriodGetHandler,
  _createPeriodPutHandler,
} from "../../../src/routes/api/periods/[periodId]/+server";
import { _createPeriodDayAddHandler } from "../../../src/routes/api/periods/[periodId]/days/[date]/add/+server";
import { _createPeriodDayOverwriteHandler } from "../../../src/routes/api/periods/[periodId]/days/[date]/overwrite/+server";
import { _createPeriodDayHistoryHandler } from "../../../src/routes/api/periods/[periodId]/days/[date]/history/+server";
import { _createPeriodDayHistoryMutationHandler } from "../../../src/routes/api/periods/[periodId]/days/[date]/history/[historyId]/+server";

export function createFixture(
  now = new Date("2026-04-20T00:00:00.000Z"),
  createHistoryId?: () => string,
): {
  services: InMemoryApiServices;
  createPeriod: ReturnType<typeof _createPeriodsHandler>;
  listPeriods: ReturnType<typeof _createPeriodsListHandler>;
  getPeriod: ReturnType<typeof _createPeriodGetHandler>;
  updatePeriod: ReturnType<typeof _createPeriodPutHandler>;
  addDay: ReturnType<typeof _createPeriodDayAddHandler>;
  overwriteDay: ReturnType<typeof _createPeriodDayOverwriteHandler>;
  getHistory: ReturnType<typeof _createPeriodDayHistoryHandler>;
  mutateHistory: ReturnType<typeof _createPeriodDayHistoryMutationHandler>;
} {
  const services = createInMemoryApiServices({
    now: () => now,
    createHistoryId,
  });

  return {
    services,
    createPeriod: _createPeriodsHandler({ services }),
    listPeriods: _createPeriodsListHandler({ services }),
    getPeriod: _createPeriodGetHandler({ services }),
    updatePeriod: _createPeriodPutHandler({ services }),
    addDay: _createPeriodDayAddHandler({ services }),
    overwriteDay: _createPeriodDayOverwriteHandler({ services }),
    getHistory: _createPeriodDayHistoryHandler({ services }),
    mutateHistory: _createPeriodDayHistoryMutationHandler({ services }),
  };
}
