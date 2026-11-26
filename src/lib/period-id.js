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

/** @param {unknown} value */
export function encodePeriodPathSegment(value) {
  if (
    !isNonBlankPeriodId(value) ||
    isReservedPeriodId(value) ||
    !value.isWellFormed()
  ) {
    return null;
  }
  return encodeURIComponent(value);
}
