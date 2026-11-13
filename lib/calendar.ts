import { parseSingaporeDateTime } from "@/lib/timezone";

const SINGAPORE_TIME_ZONE = "Asia/Singapore";

export interface CalendarDay {
  date: string;
  isCurrentMonth: boolean;
  isToday: boolean;
  isPast: boolean;
  isWeekend: boolean;
}

function utcDate(year: number, monthIndex: number, day: number): Date {
  const date = new Date(0);
  date.setUTCFullYear(year, monthIndex, day);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function formatUtcDate(date: Date): string {
  return `${String(date.getUTCFullYear()).padStart(4, "0")}-${String(
    date.getUTCMonth() + 1,
  ).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function getSingaporeDateKey(value: Date | string): string {
  const parsed =
    value instanceof Date
      ? value
      : parseSingaporeDateTime(
          /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00` : value,
        );
  if (!parsed || Number.isNaN(parsed.getTime())) {
    throw new Error("Cannot format an invalid date");
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SINGAPORE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(parsed);
  const values = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return `${values.year.padStart(4, "0")}-${values.month}-${values.day}`;
}

export function getSingaporeYearMonth(now = new Date()): {
  year: number;
  month: number;
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SINGAPORE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return { year: Number(values.year), month: Number(values.month) };
}

export function parseCalendarMonth(
  raw: string | null,
  now = new Date(),
): { year: number; month: number } {
  const currentMonth = getSingaporeYearMonth(now);
  if (!raw || !/^\d{4}-\d{2}$/.test(raw)) {
    return currentMonth;
  }

  const [year, month] = raw.split("-").map(Number);
  if (year < 1 || month < 1 || month > 12) {
    return currentMonth;
  }
  return { year, month };
}

export function generateCalendarGrid(
  year: number,
  month: number,
  now = new Date(),
): CalendarDay[] {
  if (!Number.isInteger(year) || year < 1 || year > 9999) {
    throw new RangeError("Year must be between 1 and 9999");
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError("Month must be between 1 and 12");
  }

  const firstOfMonth = utcDate(year, month - 1, 1);
  const startWeekday = firstOfMonth.getUTCDay();
  const daysInMonth = utcDate(year, month, 0).getUTCDate();
  const today = getSingaporeDateKey(now);

  return Array.from({ length: 42 }, (_, index) => {
    const dayOffset = index - startWeekday + 1;
    const cellDate = utcDate(year, month - 1, dayOffset);
    const weekday = cellDate.getUTCDay();
    const date = formatUtcDate(cellDate);

    return {
      date,
      isCurrentMonth: dayOffset >= 1 && dayOffset <= daysInMonth,
      isToday: date === today,
      isPast: date < today,
      isWeekend: weekday === 0 || weekday === 6,
    };
  });
}

export function getCalendarVisibleRange(year: number, month: number): {
  start: string;
  end: string;
} {
  const days = generateCalendarGrid(year, month);
  return { start: days[0].date, end: days[days.length - 1].date };
}

export function formatCalendarDate(date: string): string {
  const value = new Date(`${date}T00:00:00+08:00`);
  return new Intl.DateTimeFormat("en-SG", {
    dateStyle: "full",
    timeZone: SINGAPORE_TIME_ZONE,
  }).format(value);
}
