import { z } from "zod";
import type { Todo } from "@/lib/db";

const prioritySchema = z.enum(["high", "medium", "low"]);
const recurrencePatternSchema = z.enum(["daily", "weekly", "monthly", "yearly"]);

export const todoExportItemSchema = z.object({
  title: z.string().min(1),
  completed: z.boolean(),
  due_date: z.string().nullable(),
  priority: prioritySchema,
  is_recurring: z.boolean(),
  recurrence_pattern: recurrencePatternSchema.nullable(),
  reminder_minutes: z.number().int().nullable(),
  created_at: z.string(),
  subtasks: z.array(
    z.object({
      title: z.string().min(1),
      completed: z.boolean(),
      position: z.number().int(),
    }),
  ),
  tags: z.array(z.object({
    name: z.string().min(1),
    color: z.string(),
  })),
});

export const todoExportSchema = z.object({
  version: z.literal(1),
  exported_at: z.string(),
  todos: z.array(todoExportItemSchema),
});

export type TodoExportItem = z.infer<typeof todoExportItemSchema>;
export type TodoExport = z.infer<typeof todoExportSchema>;
export type ImportResult = {
  imported: number;
  tagsCreated: number;
  tagsReused: number;
};

export function createTodoExport(
  todos: readonly Todo[],
  exportedAt: Date,
): TodoExport {
  return {
    version: 1,
    exported_at: exportedAt.toISOString(),
    todos: todos.map((todo) => ({
      title: todo.title,
      completed: todo.completed,
      due_date: todo.due_date,
      priority: todo.priority,
      is_recurring: todo.is_recurring,
      recurrence_pattern: todo.recurrence_pattern,
      reminder_minutes: todo.reminder_minutes,
      created_at: todo.created_at,
      subtasks: todo.subtasks.map(({ title, completed, position }) => ({
        title,
        completed,
        position,
      })),
      tags: todo.tags.map(({ name, color }) => ({ name, color })),
    })),
  };
}

export function formatSingaporeDateStamp(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function csvCell(value: string | number | boolean | null): string {
  const text = value === null ? "" : String(value);
  const safeText = /^[\t\r ]*[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safeText)
    ? `"${safeText.replaceAll('"', '""')}"`
    : safeText;
}

export function serializeTodosAsCsv(todos: readonly Todo[]): string {
  const rows = [
    ["ID", "Title", "Completed", "Due Date", "Priority", "Recurring", "Pattern", "Reminder"],
    ...todos.map((todo) => [
      todo.id,
      todo.title,
      todo.completed,
      todo.due_date,
      todo.priority,
      todo.is_recurring,
      todo.recurrence_pattern,
      todo.reminder_minutes,
    ]),
  ];

  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
