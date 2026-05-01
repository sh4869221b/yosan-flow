import { json, type RequestHandler } from "@sveltejs/kit";

const BODY = {
  error: {
    code: "ENDPOINT_REMOVED",
    message: "day API is removed. Use /api/periods/:periodId/days/:date/add.",
  },
};

export const POST: RequestHandler = async () => {
  return json(BODY, { status: 410 });
};
