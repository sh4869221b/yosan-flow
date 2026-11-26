const expectedFields = new Set([
  "periodId",
  "date",
  "inputYen",
  "memo",
  "idempotencyKey",
]);

function parseExpense(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  if (Object.keys(body).some((key) => !expectedFields.has(key))) return null;
  const { periodId, date, inputYen, memo, idempotencyKey } = body;
  if (
    typeof periodId !== "string" ||
    periodId.length === 0 ||
    periodId.length > 256 ||
    periodId.trim() !== periodId ||
    /[/%\\\u0000-\u001f\u007f]/.test(periodId) ||
    periodId === "." ||
    periodId === ".." ||
    typeof date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isSafeInteger(inputYen) ||
    inputYen <= 0 ||
    (memo != null && (typeof memo !== "string" || memo.length > 500)) ||
    typeof idempotencyKey !== "string" ||
    !/^[a-f0-9]{32}\.dot_[a-f0-9]{32}$/.test(idempotencyKey)
  )
    return null;
  return {
    periodId,
    date,
    inputYen,
    memo: memo?.trim() || null,
    idempotencyKey,
  };
}

export default {
  async queue(batch, env) {
    const origin = new URL(env.YOSAN_ORIGIN);
    if (origin.protocol !== "https:" || origin.href !== `${origin.origin}/`) {
      throw new Error("Invalid Yosan Flow origin configuration");
    }
    for (const message of batch.messages) {
      const expense = parseExpense(message.body);
      if (!expense) {
        message.ack();
        continue;
      }
      let response;
      try {
        response = await env.YOSAN.fetch(
          new Request(
            `${origin.origin}/api/periods/${encodeURIComponent(expense.periodId)}/days/${expense.date}/add`,
            {
              method: "POST",
              redirect: "manual",
              headers: {
                "content-type": "application/json",
                "idempotency-key": expense.idempotencyKey,
                origin: origin.origin,
              },
              body: JSON.stringify({
                inputYen: expense.inputYen,
                memo: expense.memo,
              }),
            },
          ),
        );
      } catch {
        message.retry();
        continue;
      }
      if (response.body) await response.body.cancel().catch(() => {});
      if (response.status === 429 || response.status >= 500) message.retry();
      else message.ack();
    }
  },
};
