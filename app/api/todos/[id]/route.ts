import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  todoDB,
  type Priority,
  type RecurrencePattern,
  type UpdateTodoInput,
} from "@/lib/db";
import { errorResponse, readJsonObject } from "@/lib/http";
import { validateDueDate, validateTodoTitle } from "@/lib/todo";

const allowedFields = new Set([
  "title",
  "due_date",
  "priority",
  "is_recurring",
  "recurrence_pattern",
  "reminder_minutes",
  "completed",
  "tag_ids",
]);

function isPriority(value: unknown): value is Priority {
  return value === "high" || value === "medium" || value === "low";
}

function isRecurrencePattern(value: unknown): value is RecurrencePattern {
  return (
    value === "daily" ||
    value === "weekly" ||
    value === "monthly" ||
    value === "yearly"
  );
}

function isReminderMinutes(value: unknown): value is number | null {
  return (
    value === null ||
    (typeof value === "number" && Number.isSafeInteger(value) && value >= 0)
  );
}

function isTagIdList(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.every((id) => Number.isSafeInteger(id) && id > 0)
  );
}

function parseId(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) {
    return null;
  }
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

async function findOwnedTodo(id: number, userId: number) {
  const todo = todoDB.findById(id);
  return todo && todo.user_id === userId ? todo : null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return errorResponse("Not authenticated", 401);
  }

  const id = parseId((await params).id);
  if (id === null) {
    return errorResponse("Todo not found", 404);
  }

  const todo = await findOwnedTodo(id, session.userId);
  if (!todo) {
    return errorResponse("Todo not found", 404);
  }
  return NextResponse.json(todo);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return errorResponse("Not authenticated", 401);
  }

  const id = parseId((await params).id);
  if (id === null) {
    return errorResponse("Todo not found", 404);
  }

  const existing = await findOwnedTodo(id, session.userId);
  if (!existing) {
    return errorResponse("Todo not found", 404);
  }

  const body = await readJsonObject(request);
  if (!body) {
    return errorResponse("Request body must be a JSON object", 400);
  }
  if (Object.keys(body).some((key) => !allowedFields.has(key))) {
    return errorResponse("Request contains an unsupported field", 400);
  }

  const input: UpdateTodoInput = {};
  if (body.title !== undefined) {
    const title = validateTodoTitle(body.title);
    if (!title.valid) {
      return errorResponse("Title cannot be empty", 400);
    }
    input.title = title.value;
  }

  if (Object.hasOwn(body, "due_date")) {
    const dueDate = validateDueDate(body.due_date, new Date(), false);
    if (!dueDate.valid) {
      return errorResponse(dueDate.error, 400);
    }
    input.due_date = dueDate.value;
  }

  if (body.priority !== undefined) {
    if (!isPriority(body.priority)) {
      return errorResponse("Priority must be high, medium, or low", 400);
    }
    input.priority = body.priority;
  }

  if (body.is_recurring !== undefined) {
    if (typeof body.is_recurring !== "boolean") {
      return errorResponse("is_recurring must be a boolean", 400);
    }
    input.is_recurring = body.is_recurring;
  }

  if (Object.hasOwn(body, "recurrence_pattern")) {
    const pattern = body.recurrence_pattern;
    if (pattern !== null && !isRecurrencePattern(pattern)) {
      return errorResponse("Invalid recurrence_pattern", 400);
    }
    input.recurrence_pattern = pattern;
  }

  if (Object.hasOwn(body, "reminder_minutes")) {
    const reminderMinutes = body.reminder_minutes;
    if (!isReminderMinutes(reminderMinutes)) {
      return errorResponse("reminder_minutes must be a non-negative integer or null", 400);
    }
    input.reminder_minutes = reminderMinutes;
  }

  if (body.completed !== undefined) {
    if (typeof body.completed !== "boolean") {
      return errorResponse("completed must be a boolean", 400);
    }
    input.completed = body.completed;
  }

  if (Object.hasOwn(body, "tag_ids")) {
    if (!isTagIdList(body.tag_ids)) {
      return errorResponse("tag_ids must be an array of positive integers", 400);
    }
    input.tag_ids = body.tag_ids;
  }

  const isRecurring = input.is_recurring ?? existing.is_recurring;
  const recurrencePattern = input.recurrence_pattern !== undefined
    ? input.recurrence_pattern
    : existing.recurrence_pattern;
  const dueDate = input.due_date !== undefined ? input.due_date : existing.due_date;
  if (isRecurring && dueDate === null) {
    return errorResponse("Recurring todos require a due date", 400);
  }
  if (isRecurring && !isRecurrencePattern(recurrencePattern)) {
    return errorResponse("Invalid recurrence pattern", 400);
  }
  if (!isRecurring) {
    input.recurrence_pattern = null;
  }

  try {
    const result = todoDB.updateAndCreateNextInstance(id, session.userId, input);
    return result
      ? NextResponse.json(result)
      : errorResponse("Todo not found", 404);
  } catch (error) {
    if (error instanceof Error && error.message === "Tag not found") {
      return errorResponse("One or more tags were not found", 400);
    }
    throw error;
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return errorResponse("Not authenticated", 401);
  }

  const id = parseId((await params).id);
  if (id === null) {
    return errorResponse("Todo not found", 404);
  }

  const existing = await findOwnedTodo(id, session.userId);
  if (!existing) {
    return errorResponse("Todo not found", 404);
  }

  todoDB.delete(id);
  return NextResponse.json({ success: true });
}
