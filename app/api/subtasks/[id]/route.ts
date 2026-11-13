import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { subtaskDB, type UpdateSubtaskInput } from "@/lib/db";
import { errorResponse, parsePositiveId, readJsonObject } from "@/lib/http";
import { validateTodoTitle } from "@/lib/todo";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return errorResponse("Not authenticated", 401);
  const id = parsePositiveId((await params).id);
  if (id === null || !subtaskDB.findByIdForUser(id, session.userId)) {
    return errorResponse("Subtask not found", 404);
  }
  const body = await readJsonObject(request);
  if (!body) return errorResponse("Request body must be a JSON object", 400);
  if (Object.keys(body).length === 0 || Object.keys(body).some((key) => key !== "title" && key !== "completed")) {
    return errorResponse("Request must contain title or completed", 400);
  }
  const input: UpdateSubtaskInput = {};
  if (Object.hasOwn(body, "title")) {
    const title = validateTodoTitle(body.title);
    if (!title.valid) return errorResponse("Subtask title is required", 400);
    input.title = title.value;
  }
  if (Object.hasOwn(body, "completed")) {
    if (typeof body.completed !== "boolean") return errorResponse("completed must be a boolean", 400);
    input.completed = body.completed;
  }
  const updated = subtaskDB.updateForUser(id, session.userId, input);
  return updated ? NextResponse.json(updated) : errorResponse("Subtask not found", 404);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return errorResponse("Not authenticated", 401);
  const id = parsePositiveId((await params).id);
  if (id === null || !subtaskDB.deleteForUser(id, session.userId)) {
    return errorResponse("Subtask not found", 404);
  }
  return NextResponse.json({ success: true });
}
