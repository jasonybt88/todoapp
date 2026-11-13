import { PRIORITY_VALUES, type Priority, type Template, type TemplateSubtask, type UpdateTemplateInput } from "@/lib/db";
import { isReminderMinutes } from "@/lib/reminders";
import { serializeTemplateSubtasks } from "@/lib/template-utils";
import { validateTodoTitle } from "@/lib/todo";

type ValidationResult =
  | { valid: true; input: UpdateTemplateInput }
  | { valid: false; error: string };

const allowedFields = new Set([
  "name",
  "description",
  "category",
  "title_template",
  "priority",
  "is_recurring",
  "recurrence_pattern",
  "reminder_minutes",
  "due_date_offset_minutes",
  "subtasks",
]);

const recurrencePatterns = new Set(["daily", "weekly", "monthly", "yearly"]);

function isPriority(value: unknown): value is Priority {
  return PRIORITY_VALUES.some((priority) => priority === value);
}

function isRecurrencePattern(
  value: unknown,
): value is NonNullable<Template["recurrence_pattern"]> {
  return (
    typeof value === "string" &&
    recurrencePatterns.has(value)
  );
}

function optionalText(
  value: unknown,
  field: string,
  maxLength: number,
): { valid: true; value: string | null } | { valid: false; error: string } {
  if (value === null) {
    return { valid: true, value: null };
  }
  if (typeof value !== "string") {
    return { valid: false, error: `${field} must be a string or null` };
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    return { valid: false, error: `${field} must be ${maxLength} characters or fewer` };
  }
  return { valid: true, value: trimmed || null };
}

function validateSubtasks(value: unknown): TemplateSubtask[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const subtasks: TemplateSubtask[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      return null;
    }
    const subtask = item as Record<string, unknown>;
    const title = validateTodoTitle(subtask.title);
    if (
      !title.valid ||
      !Number.isSafeInteger(subtask.position) ||
      typeof subtask.position !== "number" ||
      subtask.position < 0
    ) {
      return null;
    }
    subtasks.push({ title: title.value, position: subtask.position });
  }
  return subtasks;
}

export function validateTemplateFields(
  body: Record<string, unknown>,
  current?: Template,
): ValidationResult {
  if (Object.keys(body).some((key) => !allowedFields.has(key))) {
    return { valid: false, error: "Request contains an unsupported field" };
  }

  const input: UpdateTemplateInput = {};
  if (Object.hasOwn(body, "name")) {
    const name = validateTodoTitle(body.name);
    if (!name.valid) {
      return { valid: false, error: "Template name is required" };
    }
    if (name.value.length > 100) {
      return { valid: false, error: "Template name must be 100 characters or fewer" };
    }
    input.name = name.value;
  }

  if (Object.hasOwn(body, "title_template")) {
    const title = validateTodoTitle(body.title_template);
    if (!title.valid) {
      return { valid: false, error: "Template title is required" };
    }
    input.title_template = title.value;
  }

  for (const field of ["description", "category"] as const) {
    if (Object.hasOwn(body, field)) {
      const parsed = optionalText(
        body[field],
        field,
        field === "description" ? 1000 : 100,
      );
      if (!parsed.valid) {
        return parsed;
      }
      input[field] = parsed.value;
    }
  }

  if (Object.hasOwn(body, "priority")) {
    if (!isPriority(body.priority)) {
      return { valid: false, error: "Invalid priority" };
    }
    input.priority = body.priority;
  }

  if (Object.hasOwn(body, "is_recurring")) {
    if (typeof body.is_recurring !== "boolean") {
      return { valid: false, error: "is_recurring must be a boolean" };
    }
    input.is_recurring = body.is_recurring;
  }

  if (Object.hasOwn(body, "recurrence_pattern")) {
    const pattern = body.recurrence_pattern;
    if (pattern !== null && !isRecurrencePattern(pattern)) {
      return { valid: false, error: "Invalid recurrence_pattern" };
    }
    input.recurrence_pattern = pattern;
  }

  if (Object.hasOwn(body, "reminder_minutes")) {
    const reminder = body.reminder_minutes;
    if (reminder !== null && !isReminderMinutes(reminder)) {
      return { valid: false, error: "reminder_minutes must be a supported preset or null" };
    }
    input.reminder_minutes = reminder;
  }

  if (Object.hasOwn(body, "due_date_offset_minutes")) {
    const offset = body.due_date_offset_minutes;
    if (
      offset !== null &&
      (typeof offset !== "number" || !Number.isSafeInteger(offset) || offset < 1)
    ) {
      return {
        valid: false,
        error: "due_date_offset_minutes must be a positive safe integer or null",
      };
    }
    input.due_date_offset_minutes = offset;
  }

  if (Object.hasOwn(body, "subtasks")) {
    const subtasks = validateSubtasks(body.subtasks);
    if (subtasks === null) {
      return {
        valid: false,
        error: "subtasks must be an array of titled subtasks with non-negative positions",
      };
    }
    input.subtasks_json = serializeTemplateSubtasks(subtasks);
  }

  const isRecurring = input.is_recurring ?? current?.is_recurring ?? false;
  const recurrencePattern = input.recurrence_pattern !== undefined
    ? input.recurrence_pattern
    : current?.recurrence_pattern ?? null;
  const dueDateOffset = input.due_date_offset_minutes !== undefined
    ? input.due_date_offset_minutes
    : current?.due_date_offset_minutes ?? null;
  const reminderMinutes = input.reminder_minutes !== undefined
    ? input.reminder_minutes
    : current?.reminder_minutes ?? null;

  if (isRecurring && dueDateOffset === null) {
    return {
      valid: false,
      error: "Recurring templates require a due date offset",
    };
  }
  if (isRecurring && !isRecurrencePattern(recurrencePattern)) {
    return {
      valid: false,
      error: "Recurring templates require a valid recurrence_pattern",
    };
  }
  if (!isRecurring) {
    input.recurrence_pattern = null;
  }
  if (reminderMinutes !== null && dueDateOffset === null) {
    return {
      valid: false,
      error: "Templates with reminders require a due date offset",
    };
  }

  return { valid: true, input };
}
