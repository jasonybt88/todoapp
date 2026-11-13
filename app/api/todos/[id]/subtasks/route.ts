import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { subtaskDB, todoDB } from "@/lib/db";
import { errorResponse, parsePositiveId, readJsonObject } from "@/lib/http";
import { validateTodoTitle } from "@/lib/todo";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return errorResponse("Not authenticated", 401);
  const id = parsePositiveId((await params).id);
  const todo = id === null ? null : todoDB.findById(id);
  if (!todo || todo.user_id !== session.userId) return errorResponse("Todo not found", 404);

  const body = await readJsonObject(request);
  if (!body) return errorResponse("Request body must be a JSON object", 400);
  if (Object.keys(body).some((key) => key !== "title")) {
    return errorResponse("Request contains an unsupported field", 400);
  }
  const title = validateTodoTitle(body.title);
  if (!title.valid) return errorResponse("Subtask title is required", 400);

  const subtask = subtaskDB.createForUser(todo.id, session.userId, { title: title.value });
  return subtask ? NextResponse.json(subtask, { status: 201 }) : errorResponse("Todo not found", 404);
}
