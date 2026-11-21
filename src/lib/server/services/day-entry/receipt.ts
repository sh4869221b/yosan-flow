export type DayEntryCommand = {
  readonly periodId: string;
  readonly date: string;
  readonly inputYen: number;
  readonly memo?: string | null;
  readonly idempotencyKey?: string;
};

export async function dayEntryFingerprint(
  command: DayEntryCommand,
  operation: "add" | "overwrite",
): Promise<string> {
  const input = JSON.stringify([
    command.periodId,
    command.date,
    operation,
    command.inputYen,
    command.memo ?? null,
  ]);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return new Uint8Array(digest).toHex();
}
