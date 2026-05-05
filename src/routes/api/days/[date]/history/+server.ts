import { json, type RequestHandler } from "@sveltejs/kit";

const BODY = {
  error: {
    code: "ENDPOINT_REMOVED",
    message:
      "day API is removed. Use /api/periods/:periodId/days/:date/history.",
  },
};

export const GET: RequestHandler = async () => {
  return json(BODY, { status: 410 });
};
