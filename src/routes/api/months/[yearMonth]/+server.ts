import { json, type RequestHandler } from "@sveltejs/kit";

const BODY = {
  error: {
    code: "ENDPOINT_REMOVED",
    message: "month API is removed. Use /api/periods endpoints.",
  },
};

export const GET: RequestHandler = async () => {
  return json(BODY, { status: 410 });
};
