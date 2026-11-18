type Draft = {
  inputYen: string;
  inputValue: number | null;
  memo: string;
  revision: number;
  idempotencyKey?: string;
};

export function createDayEntryDraftStore() {
  const drafts = new Map<string, Draft>();
  let revision = 0;
  const key = (periodId: string, date: string) =>
    JSON.stringify([periodId, date]);
  return {
    keyForSubmission(draft: Draft | undefined): string {
      if (draft === undefined) return crypto.randomUUID();
      return (draft.idempotencyKey ??= crypto.randomUUID());
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
