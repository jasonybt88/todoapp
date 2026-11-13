import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  templateDB,
  type CreateTemplateInput,
} from "@/lib/db";
import { errorResponse, readJsonObject } from "@/lib/http";
import { validateTemplateFields } from "@/lib/template-validation";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return errorResponse("Not authenticated", 401);
  }
  return NextResponse.json(templateDB.findAllByUser(session.userId));
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return errorResponse("Not authenticated", 401);
  }

  const body = await readJsonObject(request);
  if (!body) {
    return errorResponse("Request body must be a JSON object", 400);
  }
  const result = validateTemplateFields(body);
  if (!result.valid) {
    return errorResponse(result.error, 400);
  }
  const { name, title_template: title } = result.input;
  if (!name || !title) {
    return errorResponse("Template name and title_template are required", 400);
  }

  const input: CreateTemplateInput = {
    name,
    description: result.input.description ?? null,
    category: result.input.category ?? null,
    title_template: title,
    priority: result.input.priority ?? "medium",
    is_recurring: result.input.is_recurring ?? false,
    recurrence_pattern: result.input.is_recurring
      ? result.input.recurrence_pattern ?? null
      : null,
    reminder_minutes: result.input.reminder_minutes ?? null,
    due_date_offset_minutes: result.input.due_date_offset_minutes ?? null,
    subtasks_json: result.input.subtasks_json ?? null,
  };
  const template = templateDB.createForUser(session.userId, input);
  return NextResponse.json(template, { status: 201 });
}
