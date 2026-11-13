import type { TemplateSubtask } from "@/lib/db";

function isTemplateSubtask(value: unknown): value is TemplateSubtask {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const subtask = value as Record<string, unknown>;
  return (
    typeof subtask.title === "string" &&
    subtask.title.trim().length > 0 &&
    typeof subtask.position === "number" &&
    Number.isSafeInteger(subtask.position) &&
    subtask.position >= 0
  );
}

export function serializeTemplateSubtasks(
  subtasks: readonly TemplateSubtask[] | undefined,
): string | null {
  if (!subtasks?.length) {
    return null;
  }
  return JSON.stringify(subtasks.map(({ title, position }) => ({ title, position })));
}

export function parseTemplateSubtasks(value: string | null): TemplateSubtask[] {
  if (value === null) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return [];
    }
    throw error;
  }

  if (!Array.isArray(parsed) || !parsed.every(isTemplateSubtask)) {
    return [];
  }
  return parsed.map(({ title, position }) => ({ title, position }));
}

export function resolveTemplateDueDate(
  offsetMinutes: number | null,
  now: Date,
): string | null {
  if (offsetMinutes === null) {
    return null;
  }
  if (
    !Number.isSafeInteger(offsetMinutes) ||
    offsetMinutes < 1 ||
    !Number.isFinite(now.getTime())
  ) {
    return null;
  }

  const date = new Date(now.getTime() + offsetMinutes * 60_000);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
