/*
 * Time and money for workspace answers, fixed to one reading.
 *
 * "Today", "overdue" and "upcoming" are always judged by the wall clock in
 * Asia/Ho_Chi_Minh, whatever time zone the server or the database runs in.
 * Dates in the records are plain calendar days ("2026-09-29") and times are
 * "HH:MM", so comparing them as strings is exact.
 */

export const WORKSPACE_TIME_ZONE = "Asia/Ho_Chi_Minh";

export function workspaceNow(now: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: WORKSPACE_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

/** "2026-09-29" → "29/09/2026", without going through a Date and its zone. */
export function formatDay(day: string) {
  const [year, month, date] = day.split("-");
  return `${date}/${month}/${year}`;
}

const vnd = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
});

export function formatVnd(amount: number) {
  return vnd.format(amount);
}

/** One line of record text: no line breaks that could pose as more list items. */
export function oneLine(text: string) {
  return text.replace(/\s+/g, " ").trim();
}
