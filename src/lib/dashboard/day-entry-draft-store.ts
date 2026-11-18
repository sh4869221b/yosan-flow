type Draft = {
  inputYen: string;
  inputValue: number | null;
  memo: string;
  revision: number;
  idempotencyKey?: string;
};

function createNonce(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function createKey(epoch: string | undefined): string {
  const nonce = createNonce();
  return epoch ? `${epoch}.${nonce}` : nonce;
}

export function createDayEntryDraftStore() {
  const drafts = new Map<string, Draft>();
  let revision = 0;
  const key = (periodId: string, date: string) =>
    JSON.stringify([periodId, date]);
  return {
    keyForSubmission(draft: Draft | undefined, epoch?: string): string {
      if (draft === undefined) return createKey(epoch);
      return (draft.idempotencyKey ??= createKey(epoch));
    },
    read(periodId: string, date: string): Draft | undefined {
      return drafts.get(key(periodId, date));
    },
    write(
      periodId: string,
      date: string,
      inputYen: string,
      memo: string,
      inputValue: number | null,
    ): void {
      const draftKey = key(periodId, date);
      if (inputYen === "" && memo === "") {
        drafts.delete(draftKey);
      } else {
        drafts.set(draftKey, {
          inputYen,
          inputValue,
          memo,
          revision: ++revision,
        });
      }
    },
    clearSubmitted(
      periodId: string,
      date: string,
      submitted: Draft | undefined,
    ): void {
      const draftKey = key(periodId, date);
      if (submitted && drafts.get(draftKey)?.revision === submitted.revision) {
        drafts.delete(draftKey);
      }
    },
  };
}
