import { json, type RequestHandler } from "@sveltejs/kit";

const BODY = {
  error: {
    code: "ENDPOINT_REMOVED",
    message:
      "day API is removed. Use /api/periods/:periodId/days/:date/overwrite.",
  },
};

export const PUT: RequestHandler = async () => {
  return json(BODY, { status: 410 });
};
