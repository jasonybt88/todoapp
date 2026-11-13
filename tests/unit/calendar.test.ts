import { describe, expect, it } from "vitest";
import {
  generateCalendarGrid,
  getSingaporeDateKey,
  getSingaporeYearMonth,
  parseCalendarMonth,
} from "@/lib/calendar";

describe("generateCalendarGrid", () => {
  it("always makes a six-week grid and handles a non-leap February", () => {
    const days = generateCalendarGrid(2026, 2, new Date("2026-02-01T04:30:00.000Z"));

    expect(days).toHaveLength(42);
    expect(days[0].date).toBe("2026-02-01");
    expect(days.filter((day) => day.isCurrentMonth)).toHaveLength(28);
    expect(days.filter((day) => day.isToday)).toHaveLength(1);
  });

  it("includes leap day in February 2028", () => {
    const days = generateCalendarGrid(2028, 2, new Date("2028-02-28T04:00:00.000Z"));

    expect(days).toHaveLength(42);
    expect(days.filter((day) => day.isCurrentMonth)).toHaveLength(29);
    expect(days.some((day) => day.date === "2028-02-29" && day.isCurrentMonth)).toBe(true);
  });

  it("keeps 42 cells for months beginning on Sunday and Saturday", () => {
    expect(generateCalendarGrid(2022, 5).filter((day) => day.isCurrentMonth)).toHaveLength(31);
    expect(generateCalendarGrid(2022, 10).filter((day) => day.isCurrentMonth)).toHaveLength(31);
    expect(generateCalendarGrid(2022, 5)).toHaveLength(42);
    expect(generateCalendarGrid(2022, 10)).toHaveLength(42);
  });

  it("uses Singapore dates for today and weekend flags", () => {
    const now = new Date("2026-02-28T16:30:00.000Z");
    const days = generateCalendarGrid(2026, 3, now);
    const today = days.find((day) => day.isToday);

    expect(getSingaporeDateKey(now)).toBe("2026-03-01");
    expect(getSingaporeDateKey("2026-03-01T00:30")).toBe("2026-03-01");
    expect(getSingaporeDateKey("2026-02-28T16:30:00.000Z")).toBe("2026-03-01");
    expect(today?.date).toBe("2026-03-01");
    expect(days.filter((day) => day.isToday)).toHaveLength(1);
    expect(days.every((day, index) => day.isWeekend === (index % 7 === 0 || index % 7 === 6))).toBe(true);
    expect(generateCalendarGrid(2026, 1, now).every((day) => !day.isToday)).toBe(true);
    expect(
      generateCalendarGrid(2026, 2, now).find((day) => day.date === "2026-02-28")?.isPast,
    ).toBe(true);
  });
});

describe("parseCalendarMonth", () => {
  const now = new Date("2026-11-30T16:30:00.000Z");

  it("uses the current Singapore month for missing or invalid values", () => {
    expect(getSingaporeYearMonth(now)).toEqual({ year: 2026, month: 12 });
    expect(parseCalendarMonth(null, now)).toEqual({ year: 2026, month: 12 });
    expect(parseCalendarMonth("not-a-month", now)).toEqual({ year: 2026, month: 12 });
    expect(parseCalendarMonth("2026-13", now)).toEqual({ year: 2026, month: 12 });
  });

  it("accepts a valid month in the URL", () => {
    expect(parseCalendarMonth("2028-02", now)).toEqual({ year: 2028, month: 2 });
  });
});
