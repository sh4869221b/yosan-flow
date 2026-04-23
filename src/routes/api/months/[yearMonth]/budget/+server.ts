import { json, type RequestHandler } from "@sveltejs/kit";

const BODY = {
  error: {
    code: "ENDPOINT_REMOVED",
    message: "month budget API is removed. Use /api/periods endpoints."
  }
};

export const PUT: RequestHandler = async () => {
  return json(BODY, { status: 410 });
};
