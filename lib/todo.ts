import type { Priority, Todo } from "@/lib/db";
import { parseSingaporeDateTime } from "@/lib/timezone";

export type TodoValidation<T> =
  | { valid: true; value: T }
  | { valid: false; error: string };

const PRIORITY_ORDER: Record<Priority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export function validateTodoTitle(value: unknown): TodoValidation<string> {
  if (typeof value !== "string" || value.trim().length === 0) {
    return { valid: false, error: "Title is required" };
  }

  return { valid: true, value: value.trim() };
}

export function validateDueDate(
  value: unknown,
  now: Date,
  requireFuture: boolean,
): TodoValidation<string | null> {
  if (value === null || value === "") {
    return { valid: true, value: null };
  }
  if (typeof value !== "string") {
    return { valid: false, error: "Due date must be a valid ISO 8601 date" };
  }

  const date = parseSingaporeDateTime(value);
  if (!date) {
    return { valid: false, error: "Due date must be a valid ISO 8601 date" };
  }
  if (requireFuture && date.getTime() < now.getTime() + 60_000) {
    return {
      valid: false,
      error: "Due date must be at least 1 minute in the future",
    };
  }

  return { valid: true, value: date.toISOString() };
}

export function sortTodos(todos: Todo[]): Todo[] {
  return [...todos].sort((a, b) => {
    const priorityDifference = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (priorityDifference !== 0) {
      return priorityDifference;
    }

    const aDue = a.due_date ? new Date(a.due_date).getTime() : Number.POSITIVE_INFINITY;
    const bDue = b.due_date ? new Date(b.due_date).getTime() : Number.POSITIVE_INFINITY;
    if (aDue !== bDue) {
      return aDue - bDue;
    }

    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

export function sectionTodos(
  todos: Todo[],
  now: Date,
): { overdue: Todo[]; pending: Todo[]; completed: Todo[] } {
  const incomplete = todos.filter((todo) => !todo.completed);
  const overdue = sortTodos(
    incomplete.filter(
      (todo) => todo.due_date !== null && new Date(todo.due_date) < now,
    ),
  );
  const pending = sortTodos(
    incomplete.filter(
      (todo) => todo.due_date === null || new Date(todo.due_date) >= now,
    ),
  );
  const completed = todos
    .filter((todo) => todo.completed)
    .sort(
      (a, b) =>
        new Date(b.updated_at ?? b.created_at).getTime() -
        new Date(a.updated_at ?? a.created_at).getTime(),
    );

  return { overdue, pending, completed };
}
