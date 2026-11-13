import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  todoDB,
  type RecurrencePattern,
  type UpdateTodoInput,
} from "@/lib/db";
import { errorResponse, readJsonObject } from "@/lib/http";
import { isReminderMinutes } from "@/lib/reminders";
import { parseSingaporeDateTime } from "@/lib/timezone";
import {
  validateDueDate,
  validatePriority,
  validateTodoTitle,
} from "@/lib/todo";

const allowedFields = new Set([
  "title",
  "due_date",
  "priority",
  "is_recurring",
  "recurrence_pattern",
  "reminder_minutes",
  "last_notification_sent",
  "notification_snapshot",
  "completed",
  "tag_ids",
]);

function isRecurrencePattern(value: unknown): value is RecurrencePattern {
  return (
    value === "daily" ||
    value === "weekly" ||
    value === "monthly" ||
    value === "yearly"
  );
}

function isTagIdList(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.every((id) => Number.isSafeInteger(id) && id > 0)
  );
}

function isNotificationSnapshot(
  value: unknown,
): value is { due_date: string; reminder_minutes: number } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const snapshot = value as Record<string, unknown>;
  return Object.keys(snapshot).length === 2 &&
    typeof snapshot.due_date === "string" &&
    parseSingaporeDateTime(snapshot.due_date) !== null &&
    typeof snapshot.reminder_minutes === "number" &&
    Number.isSafeInteger(snapshot.reminder_minutes) &&
    snapshot.reminder_minutes > 0;
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

  if (Object.hasOwn(body, "priority")) {
    try {
      input.priority = validatePriority(body.priority);
    } catch (error) {
      if (error instanceof Error) {
        return errorResponse(error.message, 400);
      }
      throw error;
    }
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
    if (reminderMinutes !== null && !isReminderMinutes(reminderMinutes)) {
      return errorResponse("reminder_minutes must be a supported preset or null", 400);
    }
    input.reminder_minutes = reminderMinutes;
  }

  if (Object.hasOwn(body, "last_notification_sent")) {
    const value = body.last_notification_sent;
    if (
      typeof value !== "string" ||
      !/(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
      !parseSingaporeDateTime(value)
    ) {
      return errorResponse("last_notification_sent must be an ISO timestamp with an offset", 400);
    }
    if (Object.hasOwn(body, "due_date") || Object.hasOwn(body, "reminder_minutes")) {
      return errorResponse("Mark a notification separately from reminder changes", 400);
    }
    input.last_notification_sent = new Date(value).toISOString();
  }

  if (
    (input.reminder_minutes === undefined ? existing.reminder_minutes : input.reminder_minutes) !== null &&
    (input.due_date === undefined ? existing.due_date : input.due_date) === null
  ) {
    return errorResponse("A due date is required for a reminder", 400);
  }

  if (Object.hasOwn(body, "notification_snapshot")) {
    const snapshot = body.notification_snapshot;
    if (
      !input.last_notification_sent ||
      Object.keys(body).length !== 2 ||
      !isNotificationSnapshot(snapshot)
    ) {
      return errorResponse("Invalid notification snapshot", 400);
    }
    const { due_date, reminder_minutes } = snapshot;
    const marked = todoDB.markReminderSent(id, session.userId, due_date, reminder_minutes, input.last_notification_sent);
    return marked ? NextResponse.json(marked) : errorResponse("Reminder changed or was already delivered", 409);
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

  try {
    const updated = todoDB.update(id, input);
    return updated
      ? NextResponse.json(updated)
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
