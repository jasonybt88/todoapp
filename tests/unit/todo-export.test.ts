import { describe, expect, it } from "vitest";
import type { Todo } from "../../lib/db";
import {
  createTodoExport,
  formatSingaporeDateStamp,
  serializeTodosAsCsv,
  todoExportSchema,
} from "../../lib/todo-export";

const sampleTodo: Todo = {
  id: 12,
  user_id: 3,
  title: 'Buy milk, eggs, "bread"\nand more',
  completed: false,
  due_date: "2026-01-02T03:04:00.000Z",
  priority: "high",
  is_recurring: false,
  recurrence_pattern: null,
  reminder_minutes: null,
  last_notification_sent: null,
  created_at: "2026-01-01T10:00:00.000Z",
  updated_at: null,
  subtasks: [
    {
      id: 30,
      todo_id: 12,
      title: "Check list",
      completed: true,
      position: 0,
      created_at: "2026-01-01T10:01:00.000Z",
    },
  ],
  tags: [
    {
      id: 40,
      user_id: 3,
      name: "Work",
      color: "#123456",
      created_at: "2026-01-01T10:02:00.000Z",
    },
  ],
};

describe("todo export formatting", () => {
  it("creates a versioned export without database identifiers or notification state", () => {
    const exported = createTodoExport([sampleTodo], new Date("2026-01-01T16:30:00.000Z"));

    expect(exported).toMatchObject({
      version: 1,
      exported_at: "2026-01-01T16:30:00.000Z",
      todos: [
        {
          title: sampleTodo.title,
          subtasks: [{ title: "Check list", completed: true, position: 0 }],
          tags: [{ name: "Work", color: "#123456" }],
        },
      ],
    });
    expect(exported.todos[0]).not.toHaveProperty("id");
    expect(exported.todos[0]).not.toHaveProperty("user_id");
    expect(exported.todos[0]).not.toHaveProperty("last_notification_sent");
    expect(exported.todos[0].subtasks[0]).not.toHaveProperty("todo_id");
    expect(exported.todos[0].tags[0]).not.toHaveProperty("id");
  });

  it("formats export filenames using the Singapore calendar date", () => {
    expect(formatSingaporeDateStamp(new Date("2026-01-01T16:30:00.000Z"))).toBe("2026-01-02");
  });

  it("serializes the fixed CSV columns and escapes RFC 4180 special characters", () => {
    const csv = serializeTodosAsCsv([sampleTodo]);

    expect(csv).toBe(
      'ID,Title,Completed,Due Date,Priority,Recurring,Pattern,Reminder\r\n' +
        '12,"Buy milk, eggs, ""bread""\nand more",false,2026-01-02T03:04:00.000Z,high,false,,\r\n',
    );
  });

  it("neutralizes spreadsheet formulas in exported titles", () => {
    const csv = serializeTodosAsCsv([
      { ...sampleTodo, title: '=HYPERLINK("https://example.com")' },
    ]);

    expect(csv).toContain("'=HYPERLINK");
  });
});

describe("todo import validation", () => {
  it("accepts exported data and rejects wrong enums, missing relations, and wrong types", () => {
    const payload = createTodoExport([sampleTodo], new Date("2026-01-01T16:30:00.000Z"));
    expect(todoExportSchema.safeParse(payload).success).toBe(true);
    expect(todoExportSchema.safeParse({
      ...payload,
      todos: [{ ...payload.todos[0], priority: "urgent" }],
    }).success).toBe(false);
    expect(todoExportSchema.safeParse({
      ...payload,
      todos: [{ ...payload.todos[0], tags: undefined }],
    }).success).toBe(false);
    expect(todoExportSchema.safeParse({
      ...payload,
      todos: [{ ...payload.todos[0], completed: "false" }],
    }).success).toBe(false);
  });
});
