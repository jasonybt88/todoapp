import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { todoDB, type CreateTodoInput, type Priority, type RecurrencePattern } from "@/lib/db";
import { errorResponse, readJsonObject } from "@/lib/http";
import { isReminderMinutes } from "@/lib/reminders";
import { getSingaporeNow } from "@/lib/timezone";
import { validateDueDate, validateTodoTitle } from "@/lib/todo";

const allowedFields = new Set([
  "title",
  "due_date",
  "priority",
  "is_recurring",
  "recurrence_pattern",
  "reminder_minutes",
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

function isTagIdList(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.every((id) => Number.isSafeInteger(id) && id > 0)
  );
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return errorResponse("Not authenticated", 401);
  }

  return NextResponse.json(todoDB.findAllByUser(session.userId));
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return errorResponse("Not authenticated", 401);
  }

  const body = await readJsonObject(request);
  if (!body) {
    return errorResponse("Request body must be a JSON object", 400);
  }
  if (Object.keys(body).some((key) => !allowedFields.has(key))) {
    return errorResponse("Request contains an unsupported field", 400);
  }

  const title = validateTodoTitle(body.title);
  if (!title.valid) {
    return errorResponse(title.error, 400);
  }

  const dueDate = validateDueDate(body.due_date ?? null, getSingaporeNow(), true);
  if (!dueDate.valid) {
    return errorResponse(dueDate.error, 400);
  }

  const priority = body.priority ?? "medium";
  if (!isPriority(priority)) {
    return errorResponse("Priority must be high, medium, or low", 400);
  }

  const isRecurring = body.is_recurring ?? false;
  if (typeof isRecurring !== "boolean") {
    return errorResponse("is_recurring must be a boolean", 400);
  }

  const recurrencePattern = body.recurrence_pattern ?? null;
  if (recurrencePattern !== null && !isRecurrencePattern(recurrencePattern)) {
    return errorResponse("Invalid recurrence_pattern", 400);
  }

  const reminderMinutes = body.reminder_minutes ?? null;
  if (reminderMinutes !== null && !isReminderMinutes(reminderMinutes)) {
    return errorResponse("reminder_minutes must be a supported preset or null", 400);
  }
  if (reminderMinutes !== null && dueDate.value === null) {
    return errorResponse("A due date is required for a reminder", 400);
  }

  const tagIds = body.tag_ids ?? [];
  if (!isTagIdList(tagIds)) {
    return errorResponse("tag_ids must be an array of positive integers", 400);
  }

  try {
    const input: CreateTodoInput = {
      title: title.value,
      due_date: dueDate.value,
      priority,
      is_recurring: isRecurring,
      recurrence_pattern: recurrencePattern,
      reminder_minutes: reminderMinutes,
      tag_ids: tagIds,
    };
    const todo = todoDB.create(session.userId, input);
    return NextResponse.json(todo, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Tag not found") {
      return errorResponse("One or more tags were not found", 400);
    }
    throw error;
  }
}
