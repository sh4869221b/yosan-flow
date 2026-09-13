import { json } from "@sveltejs/kit";
import { toApiErrorResponseResult } from "$lib/server/effect/result";
import { classifyApiError } from "./error-classification";
import { createLogger } from "./logger";
import type { TelemetryErrorCode, TelemetryEvent } from "./schema";

const MUTATIONS = {
  "period.create": { route: "/api/periods", method: "POST" },
  "period.update": { route: "/api/periods/[periodId]", method: "PUT" },
  "period.boundary.propose": {
    route: "/api/periods/[periodId]",
    method: "PUT",
  },
  "period.boundary.confirm": {
    route: "/api/periods/[periodId]",
    method: "PUT",
  },
  "day.add": {
    route: "/api/periods/[periodId]/days/[date]/add",
    method: "POST",
  },
  "day.overwrite": {
    route: "/api/periods/[periodId]/days/[date]/overwrite",
    method: "PUT",
  },
  "history.update": {
    route: "/api/periods/[periodId]/days/[date]/history/[historyId]",
    method: "PATCH",
  },
  "history.delete": {
    route: "/api/periods/[periodId]/days/[date]/history/[historyId]",
    method: "DELETE",
  },
} as const;

type MutationOperation = keyof typeof MUTATIONS;
type MutationResponse = {
  readonly response: Response;
  readonly errorCode?: TelemetryErrorCode;
};

const logger = createLogger();

function logCompletion(
  operation: MutationOperation,
  status: number,
  classification: Pick<TelemetryEvent, "outcome" | "error_code">,
): void {
  logger.log({
    event: "operation.completed",
    operation,
    ...MUTATIONS[operation],
    ...classification,
    status,
  });
}

export async function runMutationResponse(
  operation: MutationOperation,
  action: (context: {
    operation: MutationOperation;
  }) => Promise<MutationResponse>,
): Promise<Response> {
  // Linked updates select their fixed terminal operation within this request.
  const context = { operation };
  let response: Response;
  let classification: Pick<TelemetryEvent, "outcome" | "error_code">;
  try {
    const result = await action(context);
    response = result.response;
    classification =
      result.errorCode === undefined
        ? { outcome: "success" }
        : classifyApiError(response.status, result.errorCode);
  } catch (error) {
    const result = toApiErrorResponseResult(error);
    response = json(result.body, { status: result.status });
    classification = classifyApiError(result.status, result.body.error.code);
  }

  // A sink failure must not become another API error response or terminal event.
  logCompletion(context.operation, response.status, classification);
  return response;
}

export function observeMutationInitialization<T>(
  operation: MutationOperation,
  initialize: () => T,
): T {
  try {
    return initialize();
  } catch (error) {
    try {
      logCompletion(operation, 500, {
        outcome: "unexpected_error",
        error_code: "INTERNAL_ERROR",
      });
    } catch {
      // Preserve the initialization failure even if its diagnostic sink fails.
      throw error;
    }
    throw error;
  }
}
