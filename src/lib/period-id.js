/** @param {unknown} value
 * @returns {value is string}
 */
export function isNonBlankPeriodId(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/** @param {unknown} value */
export function isReservedPeriodId(value) {
  return value === "." || value === "..";
}

/** @param {string} value */
export function isWellFormedPeriodId(value) {
  return value.isWellFormed();
}

/** @param {unknown} value */
export function encodePeriodPathSegment(value) {
  if (
    !isNonBlankPeriodId(value) ||
    isReservedPeriodId(value) ||
    !isWellFormedPeriodId(value)
  ) {
    return null;
  }
  return encodeURIComponent(value);
}
