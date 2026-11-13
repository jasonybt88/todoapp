import type { RecurrencePattern } from "./db";

const SINGAPORE_OFFSET_MS = 8 * 60 * 60 * 1000;
const singaporeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Singapore",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

interface DateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addDays(parts: DateParts, days: number): Pick<DateParts, "year" | "month" | "day"> {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

export function calculateNextDueDate(
  currentDueDate: string,
  pattern: RecurrencePattern,
): string {
  const date = new Date(currentDueDate);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError("Current due date must be a valid ISO 8601 date");
  }

  const formattedParts = Object.fromEntries(
    singaporeFormatter
      .formatToParts(date)
      .map(({ type, value }) => [type, Number(value)]),
  ) as Record<string, number>;
  const parts: DateParts = {
    year: formattedParts.year,
    month: formattedParts.month,
    day: formattedParts.day,
    hour: formattedParts.hour,
    minute: formattedParts.minute,
    second: formattedParts.second,
    millisecond: date.getUTCMilliseconds(),
  };

  let nextDate: Pick<DateParts, "year" | "month" | "day">;
  switch (pattern) {
    case "daily":
      nextDate = addDays(parts, 1);
      break;
    case "weekly":
      nextDate = addDays(parts, 7);
      break;
    case "monthly": {
      const month = parts.month === 12 ? 1 : parts.month + 1;
      const year = parts.month === 12 ? parts.year + 1 : parts.year;
      nextDate = {
        year,
        month,
        day: Math.min(parts.day, daysInMonth(year, month)),
      };
      break;
    }
    case "yearly": {
      const year = parts.year + 1;
      nextDate = {
        year,
        month: parts.month,
        day: Math.min(parts.day, daysInMonth(year, parts.month)),
      };
      break;
    }
  }

  const nextTimestamp =
    Date.UTC(
      nextDate.year,
      nextDate.month - 1,
      nextDate.day,
      parts.hour,
      parts.minute,
      parts.second,
      parts.millisecond,
    ) - SINGAPORE_OFFSET_MS;
  return new Date(nextTimestamp).toISOString();
}
