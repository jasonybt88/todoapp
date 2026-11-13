import { describe, expect, it } from "vitest";
import {
  sectionTodos,
  sortTodos,
  validateDueDate,
  validatePriority,
  validateTodoTitle,
} from "../../lib/todo";
import type { Todo } from "../../lib/db";

function todo(
  id: number,
  overrides: Partial<Todo> = {},
): Todo {
  return {
    id,
    user_id: 1,
    title: `Todo ${id}`,
    completed: false,
    due_date: null,
    priority: "medium",
    is_recurring: false,
    recurrence_pattern: null,
    reminder_minutes: null,
    last_notification_sent: null,
    created_at: `2026-01-01T00:00:0${id}.000Z`,
    updated_at: null,
    subtasks: [],
    tags: [],
    ...overrides,
  };
}

describe("todo input validation", () => {
  it("trims titles and rejects missing or whitespace-only values", () => {
    expect(validateTodoTitle("  Write tests  ")).toEqual({
      valid: true,
      value: "Write tests",
    });
    expect(validateTodoTitle("  ")).toMatchObject({ valid: false });
    expect(validateTodoTitle(undefined)).toMatchObject({ valid: false });
  });

  it("rejects malformed dates and enforces the one-minute creation boundary", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    expect(validateDueDate("invalid", now, true)).toMatchObject({ valid: false });
    expect(
      validateDueDate("2026-02-30T12:00:00Z", now, true),
    ).toMatchObject({ valid: false });
    expect(
      validateDueDate("2026-01-01T00:00:59.999Z", now, true),
    ).toMatchObject({ valid: false });
    expect(
      validateDueDate("2026-01-01T00:01:00.000Z", now, true),
    ).toEqual({ valid: true, value: "2026-01-01T00:01:00.000Z" });
    expect(
      validateDueDate("2026-01-01T08:01", now, true),
    ).toEqual({ valid: true, value: "2026-01-01T00:01:00.000Z" });
  });

  it("defaults omitted create priorities and rejects invalid or cleared update priorities", () => {
    expect(validatePriority(undefined, true)).toBe("medium");
    expect(validatePriority(null, true)).toBe("medium");
    expect(validatePriority("high")).toBe("high");
    expect(validatePriority("medium")).toBe("medium");
    expect(validatePriority("low")).toBe("low");
    expect(() => validatePriority(null)).toThrow(/Invalid priority: null/);
    expect(() => validatePriority("urgent")).toThrow(/Invalid priority: urgent/);
    expect(() => validatePriority("HIGH")).toThrow(/Invalid priority: HIGH/);
  });
});

describe("todo sorting and sections", () => {
  it("sorts by priority, due date, then newest creation time", () => {
    const todos = [
      todo(1, { priority: "medium", due_date: "2026-01-02T00:00:00.000Z" }),
      todo(2, { priority: "high", due_date: "2026-01-03T00:00:00.000Z" }),
      todo(3, { priority: "high", due_date: "2026-01-02T00:00:00.000Z" }),
      todo(4, {
        priority: "high",
        due_date: "2026-01-02T00:00:00.000Z",
        created_at: "2026-01-02T00:00:00.000Z",
      }),
    ];

    expect(sortTodos(todos).map(({ id }) => id)).toEqual([4, 3, 2, 1]);
  });

  it("sorts missing due dates last and does not mutate the input", () => {
    const todos = [
      todo(1, { priority: "low" }),
      todo(2, { priority: "low", due_date: "2026-01-02T00:00:00.000Z" }),
      todo(3, { priority: "low", due_date: "2026-01-02T00:00:00.000Z" }),
    ];
    const original = [...todos];

    expect(sortTodos(todos).map(({ id }) => id)).toEqual([3, 2, 1]);
    expect(todos).toEqual(original);
  });

  it("sorts 500 todos within the client-side performance target", () => {
    const todos = Array.from({ length: 500 }, (_, index) =>
      todo(index + 1, {
        priority: (["high", "medium", "low"] as const)[index % 3],
        due_date:
          index % 2 === 0
            ? new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString()
            : null,
      }),
    );
    const startedAt = performance.now();

    sortTodos(todos);

    expect(performance.now() - startedAt).toBeLessThan(50);
  });

  it("places due-at-now items in Pending and completed items in Completed", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const sections = sectionTodos(
      [
        todo(1, { due_date: "2025-12-31T23:59:59.999Z" }),
        todo(2, { due_date: now.toISOString() }),
        todo(3),
        todo(4, { completed: true, due_date: "2025-12-31T00:00:00.000Z" }),
      ],
      now,
    );

    expect(sections.overdue.map(({ id }) => id)).toEqual([1]);
    expect(sections.pending.map(({ id }) => id)).toEqual([2, 3]);
    expect(sections.completed.map(({ id }) => id)).toEqual([4]);
  });
});
