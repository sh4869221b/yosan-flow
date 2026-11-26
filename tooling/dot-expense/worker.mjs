const expectedFields = new Set([
  "periodId",
  "date",
  "inputYen",
  "memo",
  "idempotencyKey",
]);

function isPeriodId(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 256 &&
    value.trim() === value &&
    !/[/%\\\u0000-\u001f\u007f]/.test(value) &&
    value !== "." &&
    value !== ".."
  );
}

function isMemo(value) {
  return value == null || (typeof value === "string" && value.length <= 500);
}

function isExpenseObject(value) {
  return (
    value != null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).every((key) => expectedFields.has(key))
  );
}

function hasExpenseDetails(date, inputYen, memo) {
  return (
    typeof date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isSafeInteger(inputYen) &&
    inputYen > 0 &&
    isMemo(memo)
  );
}

function isDotKey(value) {
  return (
    typeof value === "string" && /^[a-f0-9]{32}\.dot_[a-f0-9]{32}$/.test(value)
  );
}

function parseExpense(body) {
  if (!isExpenseObject(body)) return null;
  const { periodId, date, inputYen, memo, idempotencyKey } = body;
  if (
    !isPeriodId(periodId) ||
    !hasExpenseDetails(date, inputYen, memo) ||
    !isDotKey(idempotencyKey)
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
