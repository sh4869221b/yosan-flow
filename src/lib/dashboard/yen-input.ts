const NON_NEGATIVE_INTEGER_YEN_PATTERN = /^\d+$/;

export function parseNonNegativeIntegerYenInput(input: string): number | null {
  const trimmedInput = input.trim();
  if (!NON_NEGATIVE_INTEGER_YEN_PATTERN.test(trimmedInput)) {
    return null;
  }

  const value = Number(trimmedInput);
  return Number.isInteger(value) && value >= 0 ? value : null;
}
