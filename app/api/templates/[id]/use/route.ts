import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { templateDB } from "@/lib/db";
import {
  errorResponse,
  parsePositiveId,
} from "@/lib/http";
import { getSingaporeNow } from "@/lib/timezone";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: RouteContext) {
  const session = await getSession();
  if (!session) {
    return errorResponse("Not authenticated", 401);
  }

  const id = parsePositiveId((await params).id);
  if (id === null || !templateDB.findByIdForUser(id, session.userId)) {
    return errorResponse("Template not found", 404);
  }

  try {
    const todo = templateDB.createTodoFromTemplate(
      id,
      session.userId,
      getSingaporeNow(),
    );
    return todo
      ? NextResponse.json(todo, { status: 201 })
      : errorResponse("Template not found", 404);
  } catch (error) {
    if (
      error instanceof Error &&
      [
        "Template due date offset is invalid",
        "Recurring templates require a due date and valid pattern",
        "Templates with reminders require a due date",
      ].includes(error.message)
    ) {
      return errorResponse(error.message, 400);
    }
    throw error;
  }
}
