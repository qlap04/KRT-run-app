/** Calendar date in Vietnam (UTC+7), as YYYY-MM-DD. */
export function todayVN(now = Date.now()) {
  return new Date(now + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Current month in Vietnam, as YYYY-MM. */
export function currentMonthVN(now = Date.now()) {
  return todayVN(now).slice(0, 7);
}
