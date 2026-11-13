import { describe, expect, it } from "vitest";
import { calculateNextDueDate } from "../../lib/recurrence";

describe("calculateNextDueDate", () => {
  it.each([
    ["daily", "2025-11-10T06:00:00.000Z", "2025-11-11T06:00:00.000Z"],
    ["weekly", "2025-11-10T06:00:00.000Z", "2025-11-17T06:00:00.000Z"],
    ["monthly", "2025-06-15T01:00:00.000Z", "2025-07-15T01:00:00.000Z"],
    ["monthly", "2025-01-31T01:00:00.000Z", "2025-02-28T01:00:00.000Z"],
    ["monthly", "2024-01-31T01:00:00.000Z", "2024-02-29T01:00:00.000Z"],
    ["monthly", "2025-12-31T01:00:00.000Z", "2026-01-31T01:00:00.000Z"],
    ["yearly", "2025-06-15T01:00:00.000Z", "2026-06-15T01:00:00.000Z"],
    ["yearly", "2024-02-28T16:00:00.000Z", "2025-02-27T16:00:00.000Z"],
  ] as const)("calculates %s recurrence from Singapore local time", (
    pattern,
    currentDueDate,
    expectedDueDate,
  ) => {
    expect(calculateNextDueDate(currentDueDate, pattern)).toBe(expectedDueDate);
  });

  it("preserves seconds, milliseconds, and local time-of-day", () => {
    expect(
      calculateNextDueDate("2025-11-10T06:00:12.345Z", "daily"),
    ).toBe("2025-11-11T06:00:12.345Z");
  });

  it("rejects malformed dates", () => {
    expect(() => calculateNextDueDate("invalid", "daily")).toThrow(RangeError);
  });
});
