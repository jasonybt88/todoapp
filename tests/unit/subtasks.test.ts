import { describe, expect, it } from "vitest";
import type { Subtask } from "../../lib/db";
import { calculateProgress } from "../../lib/subtasks";

function subtasks(total: number, completed: number): Subtask[] {
  return Array.from({ length: total }, (_, index) => ({
    id: index + 1,
    todo_id: 1,
    title: `Step ${index + 1}`,
    completed: index < completed,
    position: index,
    created_at: "2026-01-01",
  }));
}

describe("subtask progress", () => {
  it("handles empty, incomplete and completed lists", () => {
    expect(calculateProgress([])).toEqual({ completed: 0, total: 0, percent: 0 });
    expect(calculateProgress(subtasks(3, 0))).toEqual({ completed: 0, total: 3, percent: 0 });
    expect(calculateProgress(subtasks(3, 3))).toEqual({ completed: 3, total: 3, percent: 100 });
  });

  it("rounds fractional progress", () => {
    expect(calculateProgress(subtasks(7, 3))).toEqual({ completed: 3, total: 7, percent: 43 });
    expect(calculateProgress(subtasks(3, 1)).percent).toBe(33);
    expect(calculateProgress(subtasks(3, 2)).percent).toBe(67);
  });
});
